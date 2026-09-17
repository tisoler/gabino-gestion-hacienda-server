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
  DietaVersionIngrediente,
} from "../entities/dieta.entity";
import { Ingrediente } from "../entities/catalogo.entity";
import { Roles } from "src/constantes";
import { capitalizarNombre } from "../utils/nombres.util";
import { CatalogosService } from "../catalogos/catalogos.service";
import { CreateDietaDto } from "./dto/create-dieta.dto";

export interface IngredienteView {
  idIngrediente: number;
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
  ingredientes: IngredienteView[];
}

const SUMA_TARGET = 100;
const TOLERANCIA = 0.01;

@Injectable()
export class DietasService {
  constructor(
    @InjectRepository(Dieta)
    private dietaRepository: Repository<Dieta>,
    @InjectRepository(DietaVersion)
    private versionRepository: Repository<DietaVersion>,
    @InjectRepository(DietaVersionIngrediente)
    private ingredienteRepository: Repository<DietaVersionIngrediente>,
    @InjectRepository(Ingrediente)
    private ingCatalogoRepository: Repository<Ingrediente>,
    private catalogos: CatalogosService,
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
      .leftJoinAndSelect("v.ingredientes", "i")
      .leftJoinAndSelect("i.ingrediente", "ing")
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
      relations: ["ingredientes", "ingredientes.ingrediente"],
      order: { version: "DESC" },
    });
    return versiones.map((v) => this.versionToView(dieta, v));
  }

  /**
   * Crea una dieta o una nueva versión (mismo alcance + nombre). No se edita:
   * versionar desactiva la versión anterior (queda histórico). El sys-admin
   * puede crear para GLOBAL (`idEmpresa` null) o para una empresa; el resto,
   * sólo para la suya. Valida suma 100 e ingredientes del catálogo.
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

    // Resolver ingredientes: existentes (validados contra el alcance) o nuevos
    // (se crean en el alcance de la dieta: global → global, empresa → suya).
    // Se hace ANTES de la transacción: son datos de catálogo idempotentes.
    const resueltos: { idIngrediente: number; porcentaje: number }[] = [];
    const vistos = new Set<number>();
    let suma = 0;
    for (const ing of dto.ingredientes) {
      let idIng: number;
      if (ing.idIngrediente != null) {
        idIng = ing.idIngrediente;
        await this.validarIngrediente(idIng, idEmpresa);
      } else if (ing.nombre) {
        const nom = capitalizarNombre(ing.nombre);
        if (!nom) {
          throw new BadRequestException("Nombre de ingrediente vacío");
        }
        const creado = await this.catalogos.buscarOcrear(
          "ingrediente",
          nom,
          idEmpresa,
        );
        idIng = creado.id;
      } else {
        throw new BadRequestException(
          "Cada ingrediente necesita un id existente o un nombre nuevo",
        );
      }
      if (vistos.has(idIng)) {
        throw new BadRequestException(
          "Hay ingredientes duplicados en la dieta",
        );
      }
      vistos.add(idIng);
      suma += Number(ing.porcentaje);
      resueltos.push({
        idIngrediente: idIng,
        porcentaje: Number(ing.porcentaje),
      });
    }
    if (Math.abs(suma - SUMA_TARGET) > TOLERANCIA) {
      throw new BadRequestException(
        `Las proporciones deben sumar 100% (suman ${Math.round(suma * 100) / 100}%)`,
      );
    }

    const idDieta = await this.dietaRepository.manager.transaction(
      async (em) => {
        const dietaRepo = em.getRepository(Dieta);
        const versionRepo = em.getRepository(DietaVersion);
        const ingRepo = em.getRepository(DietaVersionIngrediente);

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
        await ingRepo.save(
          resueltos.map((i) =>
            ingRepo.create({
              idDietaVersion: version.id,
              idIngrediente: i.idIngrediente,
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
   * Valida un ingrediente según el alcance de la dieta: para una dieta GLOBAL
   * (idEmpresa null) exige que el ingrediente sea global; para una empresa, que
   * sea global o de esa empresa.
   */
  private async validarIngrediente(id: number, idEmpresa: number | null) {
    const ing = await this.ingCatalogoRepository.findOne({ where: { id } });
    if (!ing || (ing.idEmpresa != null && ing.idEmpresa !== idEmpresa)) {
      throw new BadRequestException(
        idEmpresa == null
          ? "Una dieta global sólo admite ingredientes globales"
          : "El ingrediente seleccionado no está disponible",
      );
    }
  }

  private async obtenerDetalle(id: number, user: any): Promise<DietaView> {
    const dieta = await this.dietaRepository.findOne({
      where: { id },
      relations: [
        "versiones",
        "versiones.ingredientes",
        "versiones.ingredientes.ingrediente",
      ],
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
      ingredientes: this.ingredientes(vigente),
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
      ingredientes: this.ingredientes(version),
    };
  }

  private ingredientes(version?: DietaVersion): IngredienteView[] {
    const lista = version?.ingredientes ?? [];
    return [...lista]
      .sort((a, b) => Number(b.porcentaje) - Number(a.porcentaje))
      .map((i) => ({
        idIngrediente: i.idIngrediente,
        nombre: i.ingrediente?.nombre ?? "",
        porcentaje: Number(i.porcentaje),
      }));
  }
}
