import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import {
  Dieta,
  DietaVersion,
  DietaVersionInsumo,
} from "../entities/dieta.entity";
import { CategoriaInsumo, Insumo } from "../entities/insumo.entity";
import { Roles } from "src/constantes";
import { capitalizarNombre } from "../utils/nombres.util";
import { CreateDietaDto } from "./dto/create-dieta.dto";

export interface InsumoView {
  idInsumo: number;
  nombre: string;
  porcentaje: number;
}

export interface DietaView {
  id: number;
  nombre: string;
  idEmpresa: number | null;
  /** true si es una dieta global (id_empresa NULL). */
  global: boolean;
  activa: boolean;
  version: number;
  actualizadaEn: Date | null;
  insumos: InsumoView[];
}

const SUMA_TARGET = 100;
const TOLERANCIA = 0.01;

/** Categoría que habilita a un insumo a componer dietas (global id 1). */
const CATEGORIA_DIETA = "ingrediente dieta";

const SUMA_MSG = (suma: number) =>
  `Las proporciones deben sumar 100% (suman ${Math.round(suma * 100) / 100}%)`;

@Injectable()
export class DietasService {
  constructor(
    @InjectRepository(Dieta)
    private dietaRepository: Repository<Dieta>,
    @InjectRepository(DietaVersion)
    private versionRepository: Repository<DietaVersion>,
    @InjectRepository(DietaVersionInsumo)
    private insumoRepository: Repository<DietaVersionInsumo>,
    @InjectRepository(Insumo)
    private insumoCatalogoRepository: Repository<Insumo>,
    @InjectRepository(CategoriaInsumo)
    private categoriaRepository: Repository<CategoriaInsumo>,
  ) {}

  private empresaActual(user: any): number | null {
    const id = user?.currentEmpresaId ?? null;
    return id ? Number(id) : null;
  }

  private esSysAdmin(user: any): boolean {
    return !!user?.roles?.includes(Roles.SYS_ADMIN);
  }

  private puedeVerTodo(user: any): boolean {
    return !!user?.permisos?.includes("escritura:dieta");
  }

  /**
   * Lista dietas visibles: las GLOBALES (id_empresa NULL) + las de la empresa
   * del usuario, con su versión vigente. `estado='todas'` incluye las
   * desactivadas (sólo con escritura:dieta); el lector ve activas.
   */
  async listar(user: any, estado?: string): Promise<DietaView[]> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) return [];
    const verTodas = estado === "todas" && this.puedeVerTodo(user);
    const qb = this.dietaRepository
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.versiones", "v")
      .leftJoinAndSelect("v.insumos", "i")
      .leftJoinAndSelect("i.insumo", "ins")
      .where("d.id_empresa IS NULL OR d.id_empresa = :e", { e: empresaId });
    if (!verTodas) qb.andWhere("d.activa = true");
    const dietas = await qb
      .orderBy("d.nombre", "ASC")
      .addOrderBy("v.version", "DESC")
      .getMany();
    return dietas.map((d) => this.toView(d));
  }

  /** Todas las versiones (histórico) de una dieta. Requiere escritura:dieta. */
  async versiones(id: number, user: any): Promise<DietaView[]> {
    const dieta = await this.getDietaVerificado(id, user);
    const versiones = await this.versionRepository.find({
      where: { idDieta: dieta.id },
      relations: ["insumos", "insumos.insumo"],
      order: { version: "DESC" },
    });
    return versiones.map((v) => this.versionToView(dieta, v));
  }

  /**
   * Crea una dieta o una nueva versión (mismo alcance + nombre). No se edita:
   * versionar desactiva la versión anterior (queda histórico). El sys-admin
   * puede crear para GLOBAL (`idEmpresa` null) o para una empresa; el resto,
   * sólo para la suya. Valida suma 100 e insumos con categoría "Ingrediente
   * dieta" (global o de la empresa). Los insumos nuevos (`nombre`) se crean
   * con esa categoría y el alcance de la dieta ("crear vía dieta", sin exigir
   * escritura:insumo).
   */
  async crear(dto: CreateDietaDto, user: any): Promise<DietaView> {
    const empresaActual = this.empresaActual(user);
    const admin = this.esSysAdmin(user);
    // Alcance destino: sys-admin elige (null = global o una empresa); resto, la suya.
    let idEmpresa: number | null;
    if (admin) {
      idEmpresa =
        dto.idEmpresa === undefined ? (empresaActual ?? null) : dto.idEmpresa;
    } else {
      if (!empresaActual) {
        throw new BadRequestException("No tenés una empresa actual asociada");
      }
      idEmpresa = empresaActual;
    }

    const nombre = capitalizarNombre(dto.nombre);
    if (!nombre)
      throw new BadRequestException("El nombre de la dieta es obligatorio");

    // Resolver insumos: existentes (validados contra el alcance) o nuevos
    // (se crean con la categoría de dieta y el alcance final). Se hace ANTES
    // de la transacción: son datos idempotentes.
    const resueltos: { idInsumo: number; porcentaje: number }[] = [];
    const vistos = new Set<number>();
    let suma = 0;
    for (const item of dto.insumos) {
      let idIns: number;
      if (item.idInsumo != null) {
        idIns = item.idInsumo;
        await this.validarInsumo(idIns, idEmpresa);
      } else if (item.nombre) {
        idIns = await this.crearInsumoDieta(item, idEmpresa);
      } else {
        throw new BadRequestException(
          "Cada insumo necesita un id existente o un nombre nuevo",
        );
      }
      if (vistos.has(idIns)) {
        throw new BadRequestException("Hay insumos duplicados en la dieta");
      }
      vistos.add(idIns);
      suma += Number(item.porcentaje);
      resueltos.push({
        idInsumo: idIns,
        porcentaje: Number(item.porcentaje),
      });
    }
    if (Math.abs(suma - SUMA_TARGET) > TOLERANCIA) {
      throw new BadRequestException(SUMA_MSG(suma));
    }

    const idDieta = await this.dietaRepository.manager.transaction(
      async (em) => {
        const dietaRepo = em.getRepository(Dieta);
        const versionRepo = em.getRepository(DietaVersion);
        const insRepo = em.getRepository(DietaVersionInsumo);

        let dieta = await dietaRepo.findOne({
          where: { idEmpresa: idEmpresa ?? IsNull(), nombre },
        });
        let nuevaVersion = 1;
        if (dieta) {
          // Desactivar las versiones vigentes anteriores (quedan como histórico).
          await versionRepo.update(
            { idDieta: dieta.id, activa: true },
            { activa: false },
          );
          const maxRow = await versionRepo
            .createQueryBuilder("v")
            .select("COALESCE(MAX(v.version), 0)", "max")
            .where("v.id_dieta = :id", { id: dieta.id })
            .getRawOne();
          nuevaVersion = Number(maxRow?.max ?? 0) + 1;
          // Crear una versión reactiva la dieta entera.
          dieta.activa = true;
          dieta = await dietaRepo.save(dieta);
        } else {
          dieta = await dietaRepo.save(
            dietaRepo.create({ idEmpresa, nombre, activa: true }),
          );
        }

        const version = await versionRepo.save(
          versionRepo.create({
            idDieta: dieta.id,
            version: nuevaVersion,
            activa: true,
          }),
        );
        await insRepo.save(
          resueltos.map((i) =>
            insRepo.create({
              idDietaVersion: version.id,
              idInsumo: i.idInsumo,
              porcentaje: i.porcentaje,
            }),
          ),
        );
        return dieta.id;
      },
    );

    return this.obtenerDetalle(idDieta, user);
  }

  /** Activa/desactiva la dieta ENTERA (manual). */
  async toggleActivo(
    id: number,
    activa: boolean,
    user: any,
  ): Promise<DietaView> {
    const dieta = await this.getDietaVerificado(id, user);
    dieta.activa = activa;
    await this.dietaRepository.save(dieta);
    return this.obtenerDetalle(dieta.id, user);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getDietaVerificado(id: number, user: any): Promise<Dieta> {
    const dieta = await this.dietaRepository.findOne({ where: { id } });
    if (!dieta) throw new NotFoundException("Dieta no encontrada");
    // Una dieta GLOBAL (id_empresa NULL) sólo la modifica el sys-admin.
    if (dieta.idEmpresa == null) {
      if (!this.esSysAdmin(user)) {
        throw new ForbiddenException(
          "Las dietas globales sólo las gestiona el administrador",
        );
      }
      return dieta;
    }
    if (!this.esSysAdmin(user)) {
      const empresaId = this.empresaActual(user);
      if (!empresaId || dieta.idEmpresa !== empresaId) {
        throw new ForbiddenException("No tiene permisos sobre esta dieta");
      }
    }
    return dieta;
  }

  /**
   * Valida un insumo según el alcance de la dieta: debe tener categoría
   * "Ingrediente dieta" (global o de la empresa) y, para una dieta GLOBAL,
   * el insumo también debe ser global; para una empresa, global o de ella.
   */
  private async validarInsumo(id: number, idEmpresa: number | null) {
    const ins = await this.insumoCatalogoRepository.findOne({
      where: { id },
      relations: ["categoria"],
    });
    if (!ins) {
      throw new BadRequestException("El insumo seleccionado no existe");
    }
    const cat = ins.categoria;
    const catApta =
      cat != null &&
      cat.nombre.toLowerCase() === CATEGORIA_DIETA &&
      (idEmpresa == null
        ? cat.idEmpresa == null
        : cat.idEmpresa == null || cat.idEmpresa === idEmpresa);
    if (!catApta) {
      throw new BadRequestException(
        idEmpresa == null
          ? "Una dieta global sólo admite insumos globales con categoría Ingrediente dieta"
          : "El insumo seleccionado no está disponible (debe tener categoría Ingrediente dieta)",
      );
    }
    if (
      idEmpresa == null
        ? ins.idEmpresa != null
        : ins.idEmpresa != null && ins.idEmpresa !== idEmpresa
    ) {
      throw new BadRequestException(
        idEmpresa == null
          ? "Una dieta global sólo admite insumos globales"
          : "El insumo seleccionado no está disponible",
      );
    }
  }

  /**
   * Crea el insumo de un item nuevo (`nombre`) con la categoría de dieta y el
   * alcance de la dieta ("crear vía dieta"). Si ya existe un insumo con ese
   * nombre en el alcance, lo reutiliza (validando que sea apto).
   */
  private async crearInsumoDieta(
    item: {
      nombre?: string;
      descripcion?: string | null;
      precioReferencia?: number | null;
      unidad?: string;
    },
    idEmpresa: number | null,
  ): Promise<number> {
    const nombre = capitalizarNombre(item.nombre ?? "");
    if (!nombre) {
      throw new BadRequestException("Nombre de insumo vacío");
    }
    const existente = await this.insumoCatalogoRepository.findOne({
      where: { idEmpresa: idEmpresa ?? IsNull(), nombre },
      relations: ["categoria"],
    });
    if (existente) {
      await this.validarInsumo(existente.id, idEmpresa);
      return existente.id;
    }
    const idCategoria = await this.resolverCategoriaDieta(idEmpresa);
    try {
      const creado = await this.insumoCatalogoRepository.save(
        this.insumoCatalogoRepository.create({
          nombre,
          descripcion: item.descripcion?.trim() || null,
          idCategoria,
          idEmpresa,
          precioReferencia: item.precioReferencia ?? null,
          unidad: item.unidad || null,
          activo: true,
        }),
      );
      return creado.id;
    } catch (e: any) {
      // Carrera: otro request creó el mismo nombre; se reutiliza si es apto.
      if (e?.code === "23505") {
        const otro = await this.insumoCatalogoRepository.findOne({
          where: { idEmpresa: idEmpresa ?? IsNull(), nombre },
        });
        if (otro) {
          await this.validarInsumo(otro.id, idEmpresa);
          return otro.id;
        }
      }
      throw e;
    }
  }

  /**
   * Categoría "Ingrediente dieta" para el alcance (prefiere la de la empresa;
   * si no existe la crea — red de seguridad, el seed la deja global).
   */
  private async resolverCategoriaDieta(
    idEmpresa: number | null,
  ): Promise<number> {
    if (idEmpresa != null) {
      const propia = await this.categoriaRepository.findOne({
        where: { idEmpresa, nombre: "Ingrediente dieta" },
      });
      // Búsqueda case-insensitive por si difiere capitalización histórica.
      const propiaCi =
        propia ??
        (await this.categoriaRepository
          .createQueryBuilder("c")
          .where("c.id_empresa = :e", { e: idEmpresa })
          .andWhere("LOWER(c.nombre) = :n", { n: CATEGORIA_DIETA })
          .getOne());
      if (propiaCi) return propiaCi.id;
    }
    const global = await this.categoriaRepository
      .createQueryBuilder("c")
      .where("c.id_empresa IS NULL")
      .andWhere("LOWER(c.nombre) = :n", { n: CATEGORIA_DIETA })
      .getOne();
    if (global) return global.id;
    const creada = await this.categoriaRepository.save(
      this.categoriaRepository.create({
        nombre: "Ingrediente dieta",
        idEmpresa,
      }),
    );
    return creada.id;
  }

  private async obtenerDetalle(id: number, user: any): Promise<DietaView> {
    const dieta = await this.dietaRepository.findOne({
      where: { id },
      relations: ["versiones", "versiones.insumos", "versiones.insumos.insumo"],
    });
    if (!dieta) throw new NotFoundException("Dieta no encontrada");
    void user;
    return this.toView(dieta);
  }

  /** Dieta + su versión vigente (activa, o la de mayor número). */
  private toView(dieta: Dieta): DietaView {
    const versiones = dieta.versiones ?? [];
    const vigente =
      versiones.find((v) => v.activa) ??
      versiones.slice().sort((a, b) => b.version - a.version)[0];
    return {
      id: dieta.id,
      nombre: dieta.nombre,
      idEmpresa: dieta.idEmpresa ?? null,
      global: dieta.idEmpresa == null,
      activa: dieta.activa,
      version: vigente?.version ?? 0,
      actualizadaEn: vigente?.createdAt ?? null,
      insumos: this.insumos(vigente),
    };
  }

  private versionToView(dieta: Dieta, version: DietaVersion): DietaView {
    return {
      id: dieta.id,
      nombre: dieta.nombre,
      idEmpresa: dieta.idEmpresa ?? null,
      global: dieta.idEmpresa == null,
      activa: dieta.activa,
      version: version.version,
      actualizadaEn: version.createdAt ?? null,
      insumos: this.insumos(version),
    };
  }

  private insumos(version?: DietaVersion): InsumoView[] {
    const lista = version?.insumos ?? [];
    return [...lista]
      .sort((a, b) => Number(b.porcentaje) - Number(a.porcentaje))
      .map((i) => ({
        idInsumo: i.idInsumo,
        nombre: i.insumo?.nombre ?? "",
        porcentaje: Number(i.porcentaje),
      }));
  }
}
