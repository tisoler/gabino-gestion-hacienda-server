import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Categoria,
  CatalogoBase,
  LugarOrigen,
  Motivo,
  Pelaje,
  Proveedor,
  Raza,
} from "../entities/catalogo.entity";
import { Empresa } from "../entities/empresa.entity";
import { CATALOGO_TIPOS, Roles, type CatalogoTipo } from "src/constantes";
import { capitalizarNombre } from "../utils/nombres.util";

export interface CatalogoItem {
  id: number;
  nombre: string;
  idEmpresa: number | null;
  /** true si es un valor global (id_empresa NULL, visible para todas). */
  global: boolean;
  /** Sólo `categoria': 'MACHO' | 'HEMBRA' | null (indistinto). */
  sexo?: string | null;
  /** Sólo `pelaje': ids de las razas asociadas (vía raza_pelaje). */
  razas?: number[];
}

export interface CatalogoAdminItem extends CatalogoItem {
  empresaNombre: string | null;
  createdAt: Date;
}

export interface CrearCatalogoExtras {
  /** sólo categoria */
  sexo?: string | null;
  /** sólo pelaje: asociar el pelaje a esta raza (global o de la empresa). */
  idRaza?: number | null;
}

const SEXOS = ["MACHO", "HEMBRA"];

/**
 * Catálogos multitenant (raza, categoria, pelaje, proveedor, lugar_origen,
 * motivo). `id_empresa` NULL = valor GLOBAL; con valor = valor de esa empresa.
 * La unicidad es por (empresa, nombre lowercase).
 */
@Injectable()
export class CatalogosService {
  private readonly repos: Record<CatalogoTipo, Repository<CatalogoBase>>;

  constructor(
    @InjectRepository(Raza)
    private readonly razaRepository: Repository<Raza>,
    @InjectRepository(Categoria) categoria: Repository<Categoria>,
    @InjectRepository(Pelaje)
    private readonly pelajeRepository: Repository<Pelaje>,
    @InjectRepository(Proveedor) proveedor: Repository<Proveedor>,
    @InjectRepository(LugarOrigen) lugarOrigen: Repository<LugarOrigen>,
    @InjectRepository(Motivo) motivo: Repository<Motivo>,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
  ) {
    this.repos = {
      raza: razaRepository as unknown as Repository<CatalogoBase>,
      categoria: categoria as unknown as Repository<CatalogoBase>,
      pelaje: pelajeRepository as unknown as Repository<CatalogoBase>,
      proveedor: proveedor as unknown as Repository<CatalogoBase>,
      lugar_origen: lugarOrigen as unknown as Repository<CatalogoBase>,
      motivo: motivo as unknown as Repository<CatalogoBase>,
    };
  }

  validarTipo(tipo: string): CatalogoTipo {
    if (!(CATALOGO_TIPOS as readonly string[]).includes(tipo)) {
      throw new BadRequestException(`Catálogo desconocido: ${tipo}`);
    }
    return tipo as CatalogoTipo;
  }

  private repo(tipo: CatalogoTipo): Repository<CatalogoBase> {
    return this.repos[tipo];
  }

  private normalizar(nombre: string): string {
    // Capitalize: primera letra de la primera palabra en mayúscula, el resto
    // en minúscula (ver `capitalizarNombre`).
    return capitalizarNombre(nombre);
  }

  private item(
    c: CatalogoBase & Partial<Pelaje> & Partial<Categoria>,
  ): CatalogoItem {
    const base: CatalogoItem = {
      id: c.id,
      nombre: c.nombre,
      idEmpresa: c.idEmpresa ?? null,
      global: c.idEmpresa == null,
    };
    if (c.sexo !== undefined) base.sexo = c.sexo ?? null;
    if (c.razas !== undefined) base.razas = (c.razas ?? []).map((r) => r.id);
    return base;
  }

  /**
   * Valores visibles para el usuario: los globales + los de su empresa actual.
   * (Sin empresa actual —p.ej. sys-admin sin `adminEmpresaId`— sólo globales.)
   * En `pelaje` incluye los ids de las razas asociadas (para filtrar por raza).
   */
  async listarVisibles(tipo: CatalogoTipo, user: any): Promise<CatalogoItem[]> {
    const empresaId = this.empresaActual(user);
    const qb = this.repo(tipo).createQueryBuilder("c");
    if (empresaId) {
      qb.where("c.id_empresa IS NULL OR c.id_empresa = :e", { e: empresaId });
    } else {
      qb.where("c.id_empresa IS NULL");
    }
    if (tipo === "pelaje") {
      qb.leftJoinAndSelect("c.razas", "razas");
    }
    // Orden alfabético asc case-insensitive (coherente con la unicidad en lowercase).
    qb.orderBy("LOWER(c.nombre)", "ASC");
    const filas = await qb.getMany();
    return filas.map((f) => this.item(f as any));
  }

  /**
   * Alta desde los formularios (usuario con escritura:lote): el valor queda
   * asociado a su empresa actual. Idempotente: si ya existe (global o de la
   * empresa, comparando en lowercase) devuelve el existente.
   * Extras: `sexo` (categoria) e `idRaza` (pelaje → crea la asociación N:N).
   */
  async crear(
    tipo: CatalogoTipo,
    nombre: string,
    user: any,
    extras?: CrearCatalogoExtras,
  ): Promise<CatalogoItem> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) {
      throw new BadRequestException(
        "No tenés una empresa actual asociada para guardar el valor",
      );
    }
    if (tipo === "pelaje" && extras?.idRaza) {
      await this.validarValor("raza", extras.idRaza, empresaId, "raza");
    }
    const fila = await this.buscarOcrear(tipo, nombre, empresaId, extras);
    return this.item(fila as any);
  }

  /** Busca por nombre (lowercase, global o de la empresa) o crea el valor. */
  async buscarOcrear(
    tipo: CatalogoTipo,
    nombre: string,
    idEmpresa: number | null,
    extras?: CrearCatalogoExtras,
  ): Promise<CatalogoBase> {
    const limpio = this.normalizar(nombre);
    if (!limpio) {
      throw new BadRequestException("El nombre es obligatorio");
    }
    const sexo = this.validarSexo(tipo, extras?.sexo);
    const repo = this.repo(tipo);
    const qb = repo
      .createQueryBuilder("c")
      .where("LOWER(c.nombre) = LOWER(:n)", { n: limpio });
    if (idEmpresa == null) {
      qb.andWhere("c.id_empresa IS NULL");
    } else {
      qb.andWhere("(c.id_empresa IS NULL OR c.id_empresa = :e)", {
        e: idEmpresa,
      });
    }
    let fila = await qb.getOne();
    if (!fila) {
      const data: any = { idEmpresa, nombre: limpio };
      if (tipo === "categoria" && sexo) data.sexo = sexo;
      fila = await repo.save(repo.create(data as Partial<CatalogoBase>));
    }
    if (tipo === "pelaje" && extras?.idRaza) {
      await this.asociarRaza(fila.id, extras.idRaza);
    }
    return fila;
  }

  /** Valida una FK de catálogo: debe ser global o de la empresa. */
  async validarValor(
    tipo: CatalogoTipo,
    id: number,
    idEmpresa: number,
    etiqueta: string,
  ): Promise<CatalogoBase> {
    const fila = await this.repo(tipo).findOne({ where: { id } });
    if (!fila || (fila.idEmpresa != null && fila.idEmpresa !== idEmpresa)) {
      throw new BadRequestException(
        `El ${etiqueta} seleccionado no está disponible`,
      );
    }
    return fila;
  }

  /** Asocia un pelaje a una raza (idempotente). */
  private async asociarRaza(idPelaje: number, idRaza: number) {
    const pelaje = await this.pelajeRepository.findOne({
      where: { id: idPelaje },
      relations: ["razas"],
    });
    if (!pelaje) return;
    pelaje.razas = pelaje.razas ?? [];
    if (pelaje.razas.some((r) => r.id === idRaza)) return;
    const raza = await this.razaRepository.findOne({ where: { id: idRaza } });
    if (!raza) return;
    pelaje.razas = [...pelaje.razas, raza];
    await this.pelajeRepository.save(pelaje);
  }

  private validarSexo(tipo: CatalogoTipo, sexo?: string | null): string | null {
    if (tipo !== "categoria") return null;
    if (sexo == null || sexo === "") return null;
    const s = String(sexo).toUpperCase();
    if (!SEXOS.includes(s)) {
      throw new BadRequestException("El sexo debe ser MACHO o HEMBRA");
    }
    return s;
  }

  // ---------------------------------------------------------------------------
  // Vista de administración (sys-admin)
  // ---------------------------------------------------------------------------

  /**
   * Listado admin con filtros: `scope` = 'todas' (default) | 'global' |
   * 'empresa' (requiere `idEmpresa`).
   */
  async listarAdmin(
    tipo: CatalogoTipo,
    scope?: string,
    idEmpresa?: number,
  ): Promise<CatalogoAdminItem[]> {
    const qb = this.repo(tipo)
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.empresa", "empresa");
    if (tipo === "pelaje") {
      qb.leftJoinAndSelect("c.razas", "razas");
    }
    if (scope === "global") {
      qb.where("c.id_empresa IS NULL");
    } else if (scope === "empresa") {
      if (!idEmpresa) {
        throw new BadRequestException("Indicá la empresa a filtrar");
      }
      qb.where("c.id_empresa = :e", { e: idEmpresa });
    }
    const filas = await qb.orderBy("LOWER(c.nombre)", "ASC").getMany();
    return filas.map((c) => ({
      ...this.item(c as any),
      empresaNombre: c.empresa?.nombre ?? null,
      createdAt: c.createdAt,
    }));
  }

  /** Alta admin: para una empresa puntual o global (idEmpresa null). */
  async crearAdmin(
    tipo: CatalogoTipo,
    nombre: string,
    idEmpresa: number | null | undefined,
    extras?: CrearCatalogoExtras,
  ): Promise<CatalogoAdminItem> {
    let empresa: Empresa | null = null;
    if (idEmpresa != null) {
      empresa = await this.empresaRepository.findOne({
        where: { id: idEmpresa, activo: true },
      });
      if (!empresa) {
        throw new NotFoundException("Empresa no encontrada");
      }
    }
    const limpio = this.normalizar(nombre);
    if (!limpio) {
      throw new BadRequestException("El nombre es obligatorio");
    }
    const sexo = this.validarSexo(tipo, extras?.sexo);
    const repo = this.repo(tipo);
    const qb = repo
      .createQueryBuilder("c")
      .where("LOWER(c.nombre) = LOWER(:n)", { n: limpio });
    if (idEmpresa == null) {
      qb.andWhere("c.id_empresa IS NULL");
    } else {
      qb.andWhere("c.id_empresa = :e", { e: idEmpresa });
    }
    let fila = await qb.getOne();
    if (!fila) {
      const data: any = { idEmpresa: idEmpresa ?? null, nombre: limpio };
      if (tipo === "categoria" && sexo) data.sexo = sexo;
      fila = await repo.save(repo.create(data as Partial<CatalogoBase>));
    }
    return {
      ...this.item(fila as any),
      empresaNombre: fila.idEmpresa == null ? null : (empresa?.nombre ?? null),
      createdAt: fila.createdAt,
    };
  }

  /** Es el usuario sys-admin (puede crear valores globales). */
  esSysAdmin(user: any): boolean {
    return !!user?.roles?.includes(Roles.SYS_ADMIN);
  }

  private empresaActual(user: any): number | null {
    const id = user?.currentEmpresaId ?? null;
    return id ? Number(id) : null;
  }
}
