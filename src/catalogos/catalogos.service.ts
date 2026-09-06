import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import {
  Categoria,
  CatalogoBase,
  LugarOrigen,
  Motivo,
  Proveedor,
  Raza,
} from "../entities/catalogo.entity";
import { Empresa } from "../entities/empresa.entity";
import { CATALOGO_TIPOS, type CatalogoTipo } from "src/constantes";
import { Roles } from "src/constantes";

export interface CatalogoItem {
  id: number;
  nombre: string;
  idEmpresa: number | null;
  /** true si es un valor global (id_empresa NULL, visible para todas). */
  global: boolean;
}

export interface CatalogoAdminItem extends CatalogoItem {
  empresaNombre: string | null;
  createdAt: Date;
}

/**
 * Catálogos multitenant (raza, categoría, proveedor, lugar de origen, motivo).
 * `id_empresa` NULL = valor GLOBAL; con valor = valor de esa empresa.
 * La unicidad es por (empresa, nombre lowercase).
 */
@Injectable()
export class CatalogosService {
  private readonly repos: Record<CatalogoTipo, Repository<CatalogoBase>>;

  constructor(
    @InjectRepository(Raza) raza: Repository<Raza>,
    @InjectRepository(Categoria) categoria: Repository<Categoria>,
    @InjectRepository(Proveedor) proveedor: Repository<Proveedor>,
    @InjectRepository(LugarOrigen) lugarOrigen: Repository<LugarOrigen>,
    @InjectRepository(Motivo) motivo: Repository<Motivo>,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
  ) {
    this.repos = {
      raza: raza as Repository<CatalogoBase>,
      categoria: categoria as Repository<CatalogoBase>,
      proveedor: proveedor as Repository<CatalogoBase>,
      lugar_origen: lugarOrigen as Repository<CatalogoBase>,
      motivo: motivo as Repository<CatalogoBase>,
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
    return nombre.trim().replace(/\s+/g, " ");
  }

  private item(c: CatalogoBase): CatalogoItem {
    return {
      id: c.id,
      nombre: c.nombre,
      idEmpresa: c.idEmpresa ?? null,
      global: c.idEmpresa == null,
    };
  }

  /**
   * Valores visibles para el usuario: los globales + los de su empresa actual.
   * (Sin empresa actual —p.ej. sys-admin sin `adminEmpresaId`— sólo globales.)
   */
  async listarVisibles(tipo: CatalogoTipo, user: any): Promise<CatalogoItem[]> {
    const where: any[] = [{ idEmpresa: IsNull() }];
    const empresaId = this.empresaActual(user);
    if (empresaId) where.push({ idEmpresa: empresaId });
    const filas = await this.repo(tipo).find({
      where,
      order: { nombre: "ASC" },
    });
    return filas.map((f) => this.item(f));
  }

  /**
   * Alta desde los formularios (usuario con escritura:lote): el valor queda
   * asociado a su empresa actual. Idempotente: si ya existe (global o de la
   * empresa, comparando en lowercase) devuelve el existente.
   */
  async crear(
    tipo: CatalogoTipo,
    nombre: string,
    user: any,
  ): Promise<CatalogoItem> {
    const empresaId = this.empresaActual(user);
    if (!empresaId) {
      throw new BadRequestException(
        "No tenés una empresa actual asociada para guardar el valor",
      );
    }
    const fila = await this.buscarOcrear(tipo, nombre, empresaId);
    return this.item(fila);
  }

  /** Busca por nombre (lowercase, global o de la empresa) o crea el valor. */
  async buscarOcrear(
    tipo: CatalogoTipo,
    nombre: string,
    idEmpresa: number | null,
  ): Promise<CatalogoBase> {
    const limpio = this.normalizar(nombre);
    if (!limpio) {
      throw new BadRequestException("El nombre es obligatorio");
    }
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
    const existente = await qb.getOne();
    if (existente) return existente;
    return repo.save(repo.create({ idEmpresa, nombre: limpio }));
  }

  /** Validación de una FK de catálogo: debe ser global o de la empresa. */
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
    if (scope === "global") {
      qb.where("c.id_empresa IS NULL");
    } else if (scope === "empresa") {
      if (!idEmpresa) {
        throw new BadRequestException("Indicá la empresa a filtrar");
      }
      qb.where("c.id_empresa = :e", { e: idEmpresa });
    }
    const filas = await qb.orderBy("c.nombre", "ASC").getMany();
    return filas.map((c) => ({
      ...this.item(c),
      empresaNombre: c.empresa?.nombre ?? null,
      createdAt: c.createdAt,
    }));
  }

  /** Alta admin: para una empresa puntual o global (idEmpresa null). */
  async crearAdmin(
    tipo: CatalogoTipo,
    nombre: string,
    idEmpresa: number | null | undefined,
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
    const repo = this.repo(tipo);
    const limpio = this.normalizar(nombre);
    if (!limpio) {
      throw new BadRequestException("El nombre es obligatorio");
    }
    const qb = repo
      .createQueryBuilder("c")
      .where("LOWER(c.nombre) = LOWER(:n)", { n: limpio });
    if (idEmpresa == null) {
      qb.andWhere("c.id_empresa IS NULL");
    } else {
      qb.andWhere("c.id_empresa = :e", { e: idEmpresa });
    }
    const existente = await qb.getOne();
    const fila =
      existente ??
      (await repo.save(
        repo.create({ idEmpresa: idEmpresa ?? null, nombre: limpio }),
      ));
    return {
      ...this.item(fila),
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
