import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import {
  Tratamiento,
  TratamientoAplicado,
  TratamientoAplicadoInsumo,
  TratamientoAplicadoLote,
} from "../entities/tratamiento.entity";
import { CategoriaInsumo, Insumo } from "../entities/insumo.entity";
import { Animal } from "../entities/animal.entity";
import { AnimalMovimiento } from "../entities/animal-movimiento.entity";
import { Lote } from "../entities/lote.entity";
import { Roles, esCliente } from "src/constantes";
import { capitalizarNombre } from "../utils/nombres.util";
import { FirestoreCacheService } from "../cache/firestore-cache.service";
import { CreateTratamientoDto } from "./dto/create-tratamiento.dto";
import { UpdateTratamientoDto } from "./dto/update-tratamiento.dto";
import {
  AplicarTratamientosDto,
  TratamientoAplicadoInsumoDto,
  TratamientoAplicadoItemDto,
} from "./dto/aplicar-tratamiento.dto";

/** Categoría que habilita a un insumo para tratamientos (global id 2). */
const CATEGORIA_VETERINARIA = "veterinaria";

export interface TratamientoAplicadoView {
  id: number;
  idAnimal: number;
  idMovimiento: number | null;
  tratamiento: { id: number; nombre: string };
  precio: number | null;
  fecha: string;
  hora: string;
  alcance: string;
  insumos: {
    id: number;
    idInsumo: number;
    nombre: string;
    precio: number | null;
  }[];
}

export type HistorialItem =
  | {
      kind: "movimiento";
      id: number;
      tipo: string;
      estadoAntes: string | null;
      estadoDespues: string | null;
      corralOrigen: string | null;
      corralDestino: string | null;
      motivo: string | null;
      idUsuario: string | null;
      usuarioNombre: string | null;
      /** Instante de negocio 'YYYY-MM-DDTHH:MM:SS'. */
      fecha: string;
      tratamientos: { id: number; nombre: string; precio: number | null }[];
    }
  | {
      kind: "tratamiento";
      id: number;
      tratamiento: { id: number; nombre: string };
      precio: number | null;
      alcance: string;
      fecha: string;
      idUsuario: string | null;
      usuarioNombre: string | null;
    };

@Injectable()
export class TratamientosService {
  constructor(
    @InjectRepository(Tratamiento)
    private tratamientoRepository: Repository<Tratamiento>,
    @InjectRepository(TratamientoAplicado)
    private aplicadoRepository: Repository<TratamientoAplicado>,
    @InjectRepository(TratamientoAplicadoInsumo)
    private aplicadoInsumoRepository: Repository<TratamientoAplicadoInsumo>,
    @InjectRepository(Insumo)
    private insumoRepository: Repository<Insumo>,
    @InjectRepository(CategoriaInsumo)
    private categoriaRepository: Repository<CategoriaInsumo>,
    @InjectRepository(Animal)
    private animalRepository: Repository<Animal>,
    @InjectRepository(AnimalMovimiento)
    private movimientoRepository: Repository<AnimalMovimiento>,
    @InjectRepository(Lote)
    private loteRepository: Repository<Lote>,
    private cache: FirestoreCacheService,
  ) {}

  private empresaActual(user: any): number | null {
    const id = user?.currentEmpresaId ?? null;
    return id ? Number(id) : null;
  }

  private esSysAdmin(user: any): boolean {
    return !!user?.roles?.includes(Roles.SYS_ADMIN);
  }

  private puedeEscribirVet(user: any): boolean {
    return !!user?.permisos?.includes("escritura:veterinaria");
  }

  // ---------------------------------------------------------------------------
  // Catálogo de tratamientos
  // ---------------------------------------------------------------------------

  async listarCatalogo(
    user: any,
    estado?: string,
    scope?: string,
    idEmpresa?: number,
  ): Promise<Tratamiento[]> {
    const admin = this.esSysAdmin(user);
    let empresa: number | null;
    if (admin) {
      empresa = idEmpresa ?? this.empresaActual(user);
    } else {
      empresa = this.empresaActual(user);
      if (!empresa) return [];
    }
    const verTodas =
      estado === "todas" && !!user?.permisos?.includes("escritura:veterinaria");
    const qb = this.tratamientoRepository.createQueryBuilder("t");
    if (scope === "global") {
      qb.where("t.id_empresa IS NULL");
    } else if (scope === "empresa") {
      if (!empresa) return [];
      qb.where("t.id_empresa = :e", { e: empresa });
    } else if (admin && !empresa) {
      qb.where("1 = 1");
    } else {
      qb.where("t.id_empresa IS NULL OR t.id_empresa = :e", { e: empresa });
    }
    if (!verTodas) qb.andWhere("t.activo = true");
    return qb.orderBy("t.createdAt", "DESC").getMany();
  }

  async crearCatalogo(
    dto: CreateTratamientoDto,
    user: any,
  ): Promise<Tratamiento> {
    const admin = this.esSysAdmin(user);
    let idEmpresa: number | null;
    if (admin) {
      idEmpresa = dto.idEmpresa === undefined ? null : dto.idEmpresa;
    } else {
      const actual = this.empresaActual(user);
      if (!actual) {
        throw new BadRequestException("No tenés una empresa actual asociada");
      }
      idEmpresa = actual;
    }
    const nombre = capitalizarNombre(dto.nombre);
    if (!nombre)
      throw new BadRequestException("El nombre del tratamiento es obligatorio");
    await this.assertNombreUnico(nombre, idEmpresa);
    return this.tratamientoRepository.save(
      this.tratamientoRepository.create({
        nombre,
        descripcion: dto.descripcion?.trim() || null,
        precioReferencia: dto.precioReferencia ?? null,
        idEmpresa,
        activo: true,
      }),
    );
  }

  async actualizarCatalogo(
    id: number,
    dto: UpdateTratamientoDto,
    user: any,
  ): Promise<Tratamiento> {
    const t = await this.getTratamientoVerificado(id, user);
    const admin = this.esSysAdmin(user);
    if (dto.idEmpresa !== undefined && dto.idEmpresa !== t.idEmpresa) {
      if (!admin) {
        throw new ForbiddenException(
          "No tiene permisos para cambiar el alcance del tratamiento",
        );
      }
      await this.assertNombreUnico(t.nombre, dto.idEmpresa, id);
      t.idEmpresa = dto.idEmpresa;
    }
    if (dto.nombre !== undefined) {
      const nombre = capitalizarNombre(dto.nombre);
      if (!nombre)
        throw new BadRequestException(
          "El nombre del tratamiento es obligatorio",
        );
      if (nombre !== t.nombre) {
        await this.assertNombreUnico(nombre, t.idEmpresa, id);
        t.nombre = nombre;
      }
    }
    if (dto.descripcion !== undefined) {
      t.descripcion = dto.descripcion?.trim() || null;
    }
    if (dto.precioReferencia !== undefined) {
      t.precioReferencia = dto.precioReferencia ?? null;
    }
    if (dto.activo !== undefined) {
      t.activo = dto.activo;
    }
    return this.tratamientoRepository.save(t);
  }

  async toggleActivoCatalogo(
    id: number,
    activo: boolean,
    user: any,
  ): Promise<Tratamiento> {
    const t = await this.getTratamientoVerificado(id, user);
    t.activo = activo;
    return this.tratamientoRepository.save(t);
  }

  // ---------------------------------------------------------------------------
  // Aplicaciones
  // ---------------------------------------------------------------------------

  /**
   * Aplica tratamiento(s) a UN animal sin movimiento (modal del historial).
   * Requiere escritura:veterinaria.
   */
  async aplicarAnimal(
    idLote: number,
    animalId: number,
    dto: AplicarTratamientosDto,
    user: any,
  ): Promise<TratamientoAplicadoView[]> {
    const { lote, animal } = await this.getAnimalVerificado(
      idLote,
      animalId,
      user,
    );
    const { fecha, hora } = this.instante(dto.fecha, dto.hora);
    const creados = await this.crearRegistros({
      animales: [animal],
      idMovimiento: null,
      fecha,
      hora,
      alcance: "animal",
      items: dto.items,
      empresaId: lote.idEmpresa,
      user,
    });
    return creados.map((c) => this.toView(c));
  }

  /**
   * Aplica tratamiento(s) a TODO el lote: un registro por animal activo
   * (sano/enfermo; no muertos ni salidos), sin id_movimiento y con
   * alcance='lote'. Bulk en transacción. Requiere escritura:veterinaria.
   */
  async aplicarLote(
    idLote: number,
    dto: AplicarTratamientosDto,
    user: any,
  ): Promise<{ aplicados: number; animales: number; idAplicacion: number }> {
    const lote = await this.getLoteVerificado(idLote, user);
    const animales = await this.animalRepository.find({
      where: { idLote: lote.id, estado: In(["sano", "enfermo"]) },
      order: { id: "ASC" },
    });
    if (animales.length === 0) {
      throw new BadRequestException("El lote no tiene animales activos");
    }
    const { fecha, hora } = this.instante(dto.fecha, dto.hora);
    // Resolver catálogos una vez (idempotente) fuera de la transacción.
    const resueltos = await this.resolverItems(dto.items, lote.idEmpresa);
    const userId = user?.id ?? null;
    // Bulk: una cabecera + UN insert multi-fila por tabla (los timestamps los
    // pone la BD por DEFAULT). Todo en la misma transacción (atómico).
    const idAplicacion = await this.aplicadoRepository.manager.transaction(
      async (em) => {
        const cab = await em.getRepository(TratamientoAplicadoLote).save(
          em.getRepository(TratamientoAplicadoLote).create({
            idLote: lote.id,
            fecha,
            hora,
            idUsuario: userId,
          }),
        );
        const filasAp: object[] = [];
        for (const animal of animales) {
          for (const r of resueltos) {
            filasAp.push({
              idAnimal: animal.id,
              idMovimiento: null,
              idAplicacionLote: cab.id,
              idTratamiento: r.idTratamiento,
              precio: r.precio,
              fecha,
              hora,
              alcance: "lote",
              idUsuario: userId,
            });
          }
        }
        const resAp = await em
          .getRepository(TratamientoAplicado)
          .insert(filasAp);
        const idsAp: number[] = resAp.identifiers.map((o: any) => o.id);
        // filasAp va en orden animal × item: el k-ésimo id corresponde al
        // k-ésimo (animal, item).
        const filasIt: object[] = [];
        let k = 0;
        for (let a = 0; a < animales.length; a++) {
          for (const r of resueltos) {
            for (const i of r.insumos) {
              filasIt.push({
                idTratamientoAplicado: idsAp[k],
                idInsumo: i.idInsumo,
                precio: i.precio,
              });
            }
            k++;
          }
        }
        if (filasIt.length > 0) {
          await em.getRepository(TratamientoAplicadoInsumo).insert(filasIt);
        }
        return cab.id;
      },
    );
    return {
      aplicados: animales.length * resueltos.length,
      animales: animales.length,
      idAplicacion,
    };
  }

  /**
   * Tratamientos del último envío a enfermería del animal (los que se
   * registraron al llevarlo), con sus insumos. Para prellenar el modal de
   * traer (editar o agregar).
   */
  async abiertos(
    idLote: number,
    animalId: number,
    user: any,
  ): Promise<TratamientoAplicadoView[]> {
    const { animal } = await this.getAnimalVerificado(idLote, animalId, user);
    const ultimoEnvio = await this.movimientoRepository.findOne({
      where: { idAnimal: animal.id, tipo: "a_enfermeria" },
      order: { fecha: "DESC", hora: "DESC", id: "DESC" },
    });
    if (!ultimoEnvio) return [];
    const filas = await this.aplicadoRepository.find({
      where: { idAnimal: animal.id, idMovimiento: ultimoEnvio.id },
      relations: ["tratamiento", "insumos", "insumos.insumo"],
      order: { id: "ASC" },
    });
    return filas.map((f) => this.toView(f));
  }

  /**
   * Historial combinado del animal: movimientos (con el resumen de sus
   * tratamientos, SIN insumos) + tratamientos directos/masivos como entradas
   * propias. Orden cronológico descendente por instante.
   */
  async historial(idLote: number, animalId: number, user: any) {
    const { animal } = await this.getAnimalVerificado(idLote, animalId, user);
    const movimientos = await this.movimientoRepository.find({
      where: { idAnimal: animal.id },
      order: { fecha: "DESC", hora: "DESC", id: "DESC" },
    });
    const usuarios = await this.cache.getOrLoadUsuarios();
    const nombreByUid = new Map<string, string | null>(
      usuarios.map((u) => [u.uid, u.nombreUsuario]),
    );
    const movIds = movimientos.map((m) => m.id);
    const aplicadosMov =
      movIds.length > 0
        ? await this.aplicadoRepository.find({
            where: { idAnimal: animal.id, idMovimiento: In(movIds) },
            relations: ["tratamiento"],
          })
        : [];
    const tratPorMov = new Map<number, typeof aplicadosMov>();
    for (const a of aplicadosMov) {
      const lista = tratPorMov.get(a.idMovimiento!) ?? [];
      lista.push(a);
      tratPorMov.set(a.idMovimiento!, lista);
    }
    const directos = await this.aplicadoRepository.find({
      where: { idAnimal: animal.id, idMovimiento: IsNull() },
      relations: ["tratamiento"],
      order: { fecha: "DESC", hora: "DESC", id: "DESC" },
    });

    const items: HistorialItem[] = [
      ...movimientos.map((m): HistorialItem => ({
        kind: "movimiento",
        id: m.id,
        tipo: m.tipo,
        estadoAntes: m.estadoAntes,
        estadoDespues: m.estadoDespues,
        corralOrigen: m.corralOrigen,
        corralDestino: m.corralDestino,
        motivo: m.motivo,
        idUsuario: m.idUsuario,
        usuarioNombre: m.idUsuario
          ? (nombreByUid.get(m.idUsuario) ?? null)
          : null,
        fecha: this.momentoIso(m.fecha, m.hora),
        tratamientos: (tratPorMov.get(m.id) ?? []).map((a) => ({
          id: a.id,
          nombre: a.tratamiento?.nombre ?? "",
          precio: a.precio == null ? null : Number(a.precio),
        })),
      })),
      ...directos.map((a): HistorialItem => ({
        kind: "tratamiento",
        id: a.id,
        tratamiento: {
          id: a.idTratamiento,
          nombre: a.tratamiento?.nombre ?? "",
        },
        precio: a.precio == null ? null : Number(a.precio),
        alcance: a.alcance,
        fecha: this.momentoIso(a.fecha, a.hora),
        idUsuario: a.idUsuario,
        usuarioNombre: a.idUsuario
          ? (nombreByUid.get(a.idUsuario) ?? null)
          : null,
      })),
    ];
    items.sort((x, y) =>
      y.fecha < x.fecha ? -1 : y.fecha > x.fecha ? 1 : y.id - x.id,
    );
    return items;
  }

  /**
   * Crea los registros de tratamiento de UN movimiento (enviar a enfermería).
   * Lo llama LotesService tras registrar el movimiento. Exige
   * escritura:veterinaria si hay items.
   */
  async crearParaMovimiento(params: {
    animalId: number;
    idMovimiento: number;
    fecha: Date | string;
    hora: string;
    items: TratamientoAplicadoItemDto[];
    empresaId: number;
    user: any;
  }): Promise<TratamientoAplicado[]> {
    if (!params.items || params.items.length === 0) return [];
    this.exigirEscrituraVet(params.user);
    const animal = await this.animalRepository.findOne({
      where: { id: params.animalId },
    });
    if (!animal) throw new NotFoundException("Animal no encontrado");
    return this.crearRegistros({
      animales: [animal],
      idMovimiento: params.idMovimiento,
      fecha: this.aDate(params.fecha) ?? this.hoyDate(),
      hora: this.normalizarHora(params.hora) ?? this.horaDe(new Date()),
      alcance: "animal",
      items: params.items,
      empresaId: params.empresaId,
      user: params.user,
    });
  }

  /**
   * Guarda los tratamientos del modal de traer: actualiza los registros
   * existentes (deben ser del animal y de un movimiento) y crea los nuevos
   * con el movimiento de alta. Los existentes conservan su fecha/hora.
   */
  async actualizarParaMovimiento(params: {
    animalId: number;
    idMovimiento: number;
    fecha: Date | string;
    hora: string;
    registros: TratamientoAplicadoItemDto[];
    empresaId: number;
    user: any;
  }): Promise<TratamientoAplicado[]> {
    const regs = params.registros ?? [];
    if (regs.length === 0) return [];
    this.exigirEscrituraVet(params.user);
    const animal = await this.animalRepository.findOne({
      where: { id: params.animalId },
    });
    if (!animal) throw new NotFoundException("Animal no encontrado");
    const fecha = this.aDate(params.fecha) ?? this.hoyDate();
    const hora = this.normalizarHora(params.hora) ?? this.horaDe(new Date());
    const out: TratamientoAplicado[] = [];
    for (const reg of regs) {
      if (reg.id != null) {
        const existente = await this.aplicadoRepository.findOne({
          where: { id: reg.id },
          relations: ["insumos"],
        });
        if (
          !existente ||
          existente.idAnimal !== animal.id ||
          existente.idMovimiento == null
        ) {
          throw new BadRequestException(
            "El tratamiento a actualizar no pertenece al animal",
          );
        }
        if (reg.idTratamiento != null || reg.nombre) {
          existente.idTratamiento = await this.resolverTratamiento(
            {
              id: reg.idTratamiento,
              nombre: reg.nombre,
              descripcion: reg.descripcion,
              precioReferencia: reg.precioReferencia,
            },
            params.empresaId,
          );
        }
        if (reg.precio !== undefined) {
          existente.precio =
            reg.precio ??
            (await this.referenciaTratamiento(existente.idTratamiento));
        }
        await this.aplicadoRepository.save(existente);
        await this.aplicadoInsumoRepository.delete({
          idTratamientoAplicado: existente.id,
        });
        const insumos = await this.resolverInsumos(
          reg.insumos,
          params.empresaId,
        );
        if (insumos.length > 0) {
          await this.aplicadoInsumoRepository.save(
            insumos.map((i) =>
              this.aplicadoInsumoRepository.create({
                idTratamientoAplicado: existente.id,
                idInsumo: i.idInsumo,
                precio: i.precio,
              }),
            ),
          );
        }
        out.push(existente);
      } else {
        const [creado] = await this.crearRegistros({
          animales: [animal],
          idMovimiento: params.idMovimiento,
          fecha,
          hora,
          alcance: "animal",
          items: [reg],
          empresaId: params.empresaId,
          user: params.user,
        });
        out.push(creado);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Resolución y creación interna
  // ---------------------------------------------------------------------------

  private exigirEscrituraVet(user: any) {
    if (!this.puedeEscribirVet(user)) {
      throw new ForbiddenException(
        "Se requiere escritura:veterinaria para cargar tratamientos",
      );
    }
  }

  private async crearRegistros(params: {
    animales: Animal[];
    idMovimiento: number | null;
    fecha: Date;
    hora: string;
    alcance: string;
    items: TratamientoAplicadoItemDto[];
    empresaId: number;
    user: any;
  }): Promise<TratamientoAplicado[]> {
    this.exigirEscrituraVet(params.user);
    const resueltos = await this.resolverItems(params.items, params.empresaId);
    const userId = params.user?.id ?? null;
    const out: TratamientoAplicado[] = [];
    for (const animal of params.animales) {
      for (const r of resueltos) {
        const ap = await this.aplicadoRepository.save(
          this.aplicadoRepository.create({
            idAnimal: animal.id,
            idMovimiento: params.idMovimiento,
            idTratamiento: r.idTratamiento,
            precio: r.precio,
            fecha: params.fecha,
            hora: params.hora,
            alcance: params.alcance,
            idUsuario: userId,
          }),
        );
        if (r.insumos.length > 0) {
          await this.aplicadoInsumoRepository.save(
            r.insumos.map((i) =>
              this.aplicadoInsumoRepository.create({
                idTratamientoAplicado: ap.id,
                idInsumo: i.idInsumo,
                precio: i.precio,
              }),
            ),
          );
        }
        out.push(ap);
      }
    }
    return out;
  }

  private async resolverItems(
    items: TratamientoAplicadoItemDto[],
    empresaId: number,
  ): Promise<
    {
      idTratamiento: number;
      precio: number | null;
      insumos: { idInsumo: number; precio: number | null }[];
    }[]
  > {
    const out: {
      idTratamiento: number;
      precio: number | null;
      insumos: { idInsumo: number; precio: number | null }[];
    }[] = [];
    for (const item of items) {
      const idTratamiento = await this.resolverTratamiento(
        {
          id: item.idTratamiento,
          nombre: item.nombre,
          descripcion: item.descripcion,
          precioReferencia: item.precioReferencia,
        },
        empresaId,
      );
      const precio =
        item.precio ?? (await this.referenciaTratamiento(idTratamiento));
      const insumos = await this.resolverInsumos(item.insumos, empresaId);
      out.push({ idTratamiento, precio, insumos });
    }
    return out;
  }

  private async resolverTratamiento(
    ref: {
      id?: number;
      nombre?: string;
      descripcion?: string | null;
      precioReferencia?: number | null;
    },
    empresaId: number,
  ): Promise<number> {
    if (ref.id != null) {
      const t = await this.tratamientoRepository.findOne({
        where: { id: ref.id },
      });
      if (!t || (t.idEmpresa != null && t.idEmpresa !== empresaId)) {
        throw new BadRequestException(
          "El tratamiento seleccionado no está disponible",
        );
      }
      return t.id;
    }
    // Alta inline (modal del editor): bajo escritura:veterinaria, sin pedir
    // otro permiso — igual que los insumos nuevos en la dieta.
    const nombre = capitalizarNombre(ref.nombre ?? "");
    if (!nombre) {
      throw new BadRequestException(
        "Cada tratamiento necesita un id existente o un nombre nuevo",
      );
    }
    // Ante empate global/empresa, prefiere la de la empresa.
    const propia = await this.tratamientoRepository
      .createQueryBuilder("t")
      .where("t.id_empresa = :e", { e: empresaId })
      .andWhere("LOWER(t.nombre) = LOWER(:n)", { n: nombre })
      .getOne();
    if (propia) return propia.id;
    const global = await this.tratamientoRepository
      .createQueryBuilder("t")
      .where("t.id_empresa IS NULL")
      .andWhere("LOWER(t.nombre) = LOWER(:n)", { n: nombre })
      .getOne();
    if (global) return global.id;
    const creado = await this.tratamientoRepository.save(
      this.tratamientoRepository.create({
        nombre,
        descripcion: ref.descripcion?.trim() || null,
        precioReferencia: ref.precioReferencia ?? null,
        idEmpresa: empresaId,
      }),
    );
    return creado.id;
  }

  private async resolverInsumos(
    insumos: TratamientoAplicadoInsumoDto[],
    empresaId: number,
  ): Promise<{ idInsumo: number; precio: number | null }[]> {
    const out: { idInsumo: number; precio: number | null }[] = [];
    for (const item of insumos ?? []) {
      const idInsumo = await this.resolverInsumoVet(
        {
          id: item.idInsumo,
          nombre: item.nombre,
          descripcion: item.descripcion,
          precioReferencia: item.precioReferencia,
          unidad: item.unidad,
          idCategoria: item.idCategoria,
        },
        empresaId,
      );
      const precio = item.precio ?? (await this.referenciaInsumo(idInsumo));
      out.push({ idInsumo, precio });
    }
    return out;
  }

  private async resolverInsumoVet(
    ref: {
      id?: number;
      nombre?: string;
      descripcion?: string | null;
      precioReferencia?: number | null;
      unidad?: string;
      idCategoria?: number | null;
    },
    empresaId: number,
  ): Promise<number> {
    if (ref.id != null) {
      const ins = await this.insumoRepository.findOne({
        where: { id: ref.id },
        relations: ["categoria"],
      });
      if (
        !ins ||
        ins.categoria?.nombre.toLowerCase() !== CATEGORIA_VETERINARIA ||
        (ins.categoria.idEmpresa != null &&
          ins.categoria.idEmpresa !== empresaId) ||
        (ins.idEmpresa != null && ins.idEmpresa !== empresaId)
      ) {
        throw new BadRequestException(
          "El insumo seleccionado no está disponible (debe tener categoría Veterinaria)",
        );
      }
      return ins.id;
    }
    // Alta inline (modal del editor): bajo escritura:veterinaria, sin pedir
    // escritura:insumo — igual que los insumos nuevos en la dieta.
    const nombre = capitalizarNombre(ref.nombre ?? "");
    if (!nombre) {
      throw new BadRequestException(
        "Cada insumo necesita un id existente o un nombre nuevo",
      );
    }
    const existente = await this.insumoRepository
      .createQueryBuilder("i")
      .leftJoinAndSelect("i.categoria", "c")
      .where("LOWER(i.nombre) = LOWER(:n)", { n: nombre })
      .andWhere("(i.id_empresa IS NULL OR i.id_empresa = :e)", {
        e: empresaId,
      })
      .andWhere("LOWER(c.nombre) = :cat", { cat: CATEGORIA_VETERINARIA })
      .andWhere("(c.id_empresa IS NULL OR c.id_empresa = :e)", {
        e: empresaId,
      })
      .getOne();
    if (existente) return existente.id;
    let idCategoria: number;
    if (ref.idCategoria != null) {
      const cat = await this.categoriaRepository.findOne({
        where: { id: ref.idCategoria },
      });
      if (
        !cat ||
        cat.nombre.toLowerCase() !== CATEGORIA_VETERINARIA ||
        (cat.idEmpresa != null && cat.idEmpresa !== empresaId)
      ) {
        throw new BadRequestException(
          "La categoría indicada no está disponible",
        );
      }
      idCategoria = cat.id;
    } else {
      idCategoria = await this.resolverCategoriaVet(empresaId);
    }
    const creado = await this.insumoRepository.save(
      this.insumoRepository.create({
        nombre,
        descripcion: ref.descripcion?.trim() || null,
        precioReferencia: ref.precioReferencia ?? null,
        unidad: ref.unidad || null,
        idCategoria,
        idEmpresa: empresaId,
        activo: true,
      }),
    );
    return creado.id;
  }

  private async resolverCategoriaVet(empresaId: number): Promise<number> {
    const propia = await this.categoriaRepository
      .createQueryBuilder("c")
      .where("c.id_empresa = :e", { e: empresaId })
      .andWhere("LOWER(c.nombre) = :n", { n: CATEGORIA_VETERINARIA })
      .getOne();
    if (propia) return propia.id;
    const global = await this.categoriaRepository
      .createQueryBuilder("c")
      .where("c.id_empresa IS NULL")
      .andWhere("LOWER(c.nombre) = :n", { n: CATEGORIA_VETERINARIA })
      .getOne();
    if (global) return global.id;
    const creada = await this.categoriaRepository.save(
      this.categoriaRepository.create({
        nombre: "Veterinaria",
        idEmpresa: empresaId,
      }),
    );
    return creada.id;
  }

  private async referenciaTratamiento(id: number): Promise<number | null> {
    const t = await this.tratamientoRepository.findOne({ where: { id } });
    return t?.precioReferencia == null ? null : Number(t.precioReferencia);
  }

  private async referenciaInsumo(id: number): Promise<number | null> {
    const i = await this.insumoRepository.findOne({ where: { id } });
    return i?.precioReferencia == null ? null : Number(i.precioReferencia);
  }

  // ---------------------------------------------------------------------------
  // Verificación y vistas
  // ---------------------------------------------------------------------------

  private async getLoteVerificado(id: number, user: any): Promise<Lote> {
    const lote = await this.loteRepository.findOne({ where: { id } });
    if (!lote) {
      throw new NotFoundException("Lote no encontrado");
    }
    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);
    if (!isAdmin) {
      const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
        Number(e),
      );
      if (!userEmpresas.includes(lote.idEmpresa)) {
        throw new ForbiddenException("No tiene permisos sobre este lote");
      }
      if (esCliente(user.roles) && lote.idCliente !== user.id) {
        throw new NotFoundException("Lote no encontrado");
      }
    }
    return lote;
  }

  private async getAnimalVerificado(
    idLote: number,
    animalId: number,
    user: any,
  ): Promise<{ lote: Lote; animal: Animal }> {
    const lote = await this.getLoteVerificado(idLote, user);
    const animal = await this.animalRepository.findOne({
      where: { id: animalId, idLote: lote.id },
    });
    if (!animal) {
      throw new NotFoundException("Animal no encontrado");
    }
    return { lote, animal };
  }

  private async getTratamientoVerificado(
    id: number,
    user: any,
  ): Promise<Tratamiento> {
    const t = await this.tratamientoRepository.findOne({ where: { id } });
    if (!t) throw new NotFoundException("Tratamiento no encontrado");
    if (t.idEmpresa == null) {
      if (!this.esSysAdmin(user)) {
        throw new ForbiddenException(
          "Los tratamientos globales sólo los gestiona el administrador",
        );
      }
      return t;
    }
    if (!this.esSysAdmin(user)) {
      const empresaId = this.empresaActual(user);
      if (!empresaId || t.idEmpresa !== empresaId) {
        throw new ForbiddenException(
          "No tiene permisos sobre este tratamiento",
        );
      }
    }
    return t;
  }

  private async assertNombreUnico(
    nombre: string,
    idEmpresa: number | null,
    excluirId?: number,
  ) {
    const existente = await this.tratamientoRepository.findOne({
      where: { idEmpresa: idEmpresa ?? IsNull(), nombre },
    });
    if (existente && existente.id !== excluirId) {
      throw new BadRequestException(
        idEmpresa == null
          ? "Ya existe un tratamiento global con ese nombre"
          : "Ya existe un tratamiento con ese nombre en tu empresa",
      );
    }
  }

  private toView(a: TratamientoAplicado): TratamientoAplicadoView {
    return {
      id: a.id,
      idAnimal: a.idAnimal,
      idMovimiento: a.idMovimiento,
      tratamiento: {
        id: a.idTratamiento,
        nombre: a.tratamiento?.nombre ?? "",
      },
      precio: a.precio == null ? null : Number(a.precio),
      fecha: this.fechaIso(a.fecha),
      hora: (a.hora ?? "12:00:00").slice(0, 8),
      alcance: a.alcance,
      insumos: (a.insumos ?? []).map((i) => ({
        id: i.id,
        idInsumo: i.idInsumo,
        nombre: i.insumo?.nombre ?? "",
        precio: i.precio == null ? null : Number(i.precio),
      })),
    };
  }

  private instante(
    fecha?: string,
    hora?: string,
  ): { fecha: Date; hora: string } {
    return {
      fecha: this.aDate(fecha) ?? this.hoyDate(),
      hora: this.normalizarHora(hora) ?? this.horaDe(new Date()),
    };
  }

  private aDate(iso?: string | Date | null): Date | null {
    if (iso == null) return null;
    if (iso instanceof Date) return iso;
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  private hoyDate(): Date {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private normalizarHora(h?: string | null): string | null {
    if (!h) return null;
    const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(h.trim());
    if (!m) return null;
    return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
  }

  private horaDe(d: Date): string {
    const p = (n: number) => `${n}`.padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  private fechaIso(f: Date | string | null): string {
    if (f == null) return "";
    if (typeof f === "string") return f.slice(0, 10);
    const y = f.getFullYear();
    const m = `${f.getMonth() + 1}`.padStart(2, "0");
    const d = `${f.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /** 'YYYY-MM-DDTHH:MM:SS' (local) a partir de una columna DATE + hora. */
  private momentoIso(fecha: Date | string | null, hora: string | null): string {
    const d =
      fecha == null
        ? ""
        : typeof fecha === "string"
          ? fecha.slice(0, 10)
          : fecha.toISOString().slice(0, 10);
    const h = (hora ?? "00:00:00").slice(0, 8);
    return d ? `${d}T${h}` : "";
  }
}
