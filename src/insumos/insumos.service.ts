import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { CategoriaInsumo, Insumo } from "../entities/insumo.entity";
import { Roles } from "src/constantes";
import { capitalizarNombre } from "../utils/nombres.util";
import { CreateInsumoDto } from "./dto/create-insumo.dto";
import { UpdateInsumoDto } from "./dto/update-insumo.dto";

@Injectable()
export class InsumosService {
  constructor(
    @InjectRepository(Insumo)
    private insumoRepository: Repository<Insumo>,
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
    return !!user?.permisos?.includes("escritura:insumo");
  }

  /**
   * Lista insumos visibles con su categoría: por defecto los GLOBALES
   * (id_empresa NULL) + los de la empresa. `scope` refina: 'global' sólo
   * globales, 'empresa' sólo de una empresa, 'todas' (default) ambos.
   * `idEmpresa` (sólo sys-admin) fija la empresa del scope; el resto usa
   * siempre su empresa actual. `estado='todas'` incluye los desactivados
   * (sólo con escritura:insumo); el lector ve activos.
   */
  async listar(
    user: any,
    estado?: string,
    scope?: string,
    idEmpresa?: number,
  ): Promise<Insumo[]> {
    const admin = this.esSysAdmin(user);
    let empresa: number | null;
    if (admin) {
      empresa = idEmpresa ?? this.empresaActual(user);
    } else {
      empresa = this.empresaActual(user);
      if (!empresa) return [];
    }

    const verTodas = estado === "todas" && this.puedeVerTodo(user);
    const qb = this.insumoRepository
      .createQueryBuilder("i")
      .leftJoinAndSelect("i.categoria", "c");
    if (scope === "global") {
      qb.where("i.id_empresa IS NULL");
    } else if (scope === "empresa") {
      if (!empresa) return [];
      qb.where("i.id_empresa = :e", { e: empresa });
    } else if (admin && !empresa) {
      // Sys-admin sin empresa: ve todo (globales + todas las empresas).
      qb.where("1 = 1");
    } else {
      qb.where("i.id_empresa IS NULL OR i.id_empresa = :e", { e: empresa });
    }
    if (!verTodas) qb.andWhere("i.activo = true");
    return qb.orderBy("LOWER(i.nombre)", "ASC").getMany();
  }

  /**
   * Categorías visibles: GLOBALES + las de la empresa (`idEmpresa` sólo
   * sys-admin; el resto usa su empresa actual). Orden alfabético
   * case-insensitive (regla 9).
   */
  async categorias(user: any, idEmpresa?: number): Promise<CategoriaInsumo[]> {
    const admin = this.esSysAdmin(user);
    const empresa = admin
      ? (idEmpresa ?? this.empresaActual(user))
      : this.empresaActual(user);
    const qb = this.categoriaRepository.createQueryBuilder("c");
    if (admin && !empresa) {
      qb.where("1 = 1");
    } else if (!empresa) {
      qb.where("c.id_empresa IS NULL");
    } else {
      qb.where("c.id_empresa IS NULL OR c.id_empresa = :e", { e: empresa });
    }
    return qb.orderBy("LOWER(c.nombre)", "ASC").getMany();
  }

  /**
   * Crea un insumo. El sys-admin elige el alcance (`idEmpresa` null =
   * GLOBAL); el resto crea para su empresa actual. La categoría puede ser
   * existente (`idCategoria`, global o de la empresa destino) o nueva
   * (`categoriaNueva`: se busca o se crea con el alcance del insumo, mismo
   * mecanismo que los insumos nuevos al guardar una dieta).
   */
  async crear(dto: CreateInsumoDto, user: any): Promise<Insumo> {
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
      throw new BadRequestException("El nombre del insumo es obligatorio");
    await this.assertNombreUnico(nombre, idEmpresa);

    const idCategoria = await this.resolverCategoria(
      dto.idCategoria,
      dto.categoriaNueva,
      idEmpresa,
    );

    const insumo = await this.insumoRepository.save(
      this.insumoRepository.create({
        nombre,
        descripcion: dto.descripcion?.trim() || null,
        idCategoria,
        idEmpresa,
        precioReferencia: dto.precioReferencia ?? null,
        unidad: dto.unidad || null,
        activo: true,
      }),
    );
    return this.conCategoria(insumo.id);
  }

  /**
   * Edita un insumo. Uno GLOBAL sólo lo modifica el sys-admin; uno de
   * empresa, el sys-admin o su empresa (con escritura:insumo, ya exigido por
   * el controller). Sólo el sys-admin puede cambiar el alcance.
   */
  async actualizar(
    id: number,
    dto: UpdateInsumoDto,
    user: any,
  ): Promise<Insumo> {
    const insumo = await this.getInsumoVerificado(id, user);
    const admin = this.esSysAdmin(user);

    if (dto.idEmpresa !== undefined && dto.idEmpresa !== insumo.idEmpresa) {
      if (!admin) {
        throw new ForbiddenException(
          "No tiene permisos para cambiar el alcance del insumo",
        );
      }
      await this.assertNombreUnico(insumo.nombre, dto.idEmpresa, id);
      insumo.idEmpresa = dto.idEmpresa;
    }

    if (dto.nombre !== undefined) {
      const nombre = capitalizarNombre(dto.nombre);
      if (!nombre)
        throw new BadRequestException("El nombre del insumo es obligatorio");
      if (nombre !== insumo.nombre) {
        await this.assertNombreUnico(nombre, insumo.idEmpresa, id);
        insumo.nombre = nombre;
      }
    }

    if (dto.descripcion !== undefined) {
      insumo.descripcion = dto.descripcion?.trim() || null;
    }

    if (dto.idCategoria !== undefined || dto.categoriaNueva !== undefined) {
      insumo.idCategoria = await this.resolverCategoria(
        dto.idCategoria,
        dto.categoriaNueva,
        insumo.idEmpresa,
      );
    }

    if (dto.precioReferencia !== undefined) {
      insumo.precioReferencia = dto.precioReferencia ?? null;
    }

    if (dto.unidad !== undefined) {
      insumo.unidad = dto.unidad || null;
    }

    if (dto.activo !== undefined) {
      insumo.activo = dto.activo;
    }

    await this.insumoRepository.save(insumo);
    return this.conCategoria(insumo.id);
  }

  /** Activa/desactiva el insumo entero (manual). */
  async toggleActivo(id: number, activo: boolean, user: any): Promise<Insumo> {
    const insumo = await this.getInsumoVerificado(id, user);
    insumo.activo = activo;
    await this.insumoRepository.save(insumo);
    return this.conCategoria(insumo.id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getInsumoVerificado(id: number, user: any): Promise<Insumo> {
    const insumo = await this.insumoRepository.findOne({ where: { id } });
    if (!insumo) throw new NotFoundException("Insumo no encontrado");
    // Un insumo GLOBAL (id_empresa NULL) sólo lo modifica el sys-admin.
    if (insumo.idEmpresa == null) {
      if (!this.esSysAdmin(user)) {
        throw new ForbiddenException(
          "Los insumos globales sólo los gestiona el administrador",
        );
      }
      return insumo;
    }
    if (!this.esSysAdmin(user)) {
      const empresaId = this.empresaActual(user);
      if (!empresaId || insumo.idEmpresa !== empresaId) {
        throw new ForbiddenException("No tiene permisos sobre este insumo");
      }
    }
    return insumo;
  }

  private async conCategoria(id: number): Promise<Insumo> {
    const insumo = await this.insumoRepository.findOne({
      where: { id },
      relations: ["categoria"],
    });
    if (!insumo) throw new NotFoundException("Insumo no encontrado");
    return insumo;
  }

  /** Nombre único por alcance (global o empresa), case-insensitive. */
  private async assertNombreUnico(
    nombre: string,
    idEmpresa: number | null,
    excluirId?: number,
  ) {
    const existente = await this.insumoRepository.findOne({
      where: { idEmpresa: idEmpresa ?? IsNull(), nombre },
    });
    if (existente && existente.id !== excluirId) {
      throw new BadRequestException(
        idEmpresa == null
          ? "Ya existe un insumo global con ese nombre"
          : "Ya existe un insumo con ese nombre en tu empresa",
      );
    }
  }

  /**
   * Resuelve la categoría del insumo: existente (`idCategoria`, debe ser
   * global o de la empresa destino) o nueva (`categoriaNueva`: busca
   * case-insensitive en el alcance o la crea con ese alcance). Sin ambas,
   * null (sin categoría).
   */
  private async resolverCategoria(
    idCategoria: number | null | undefined,
    categoriaNueva: string | undefined,
    idEmpresa: number | null,
  ): Promise<number | null> {
    if (categoriaNueva !== undefined) {
      const nombre = capitalizarNombre(categoriaNueva);
      if (!nombre)
        throw new BadRequestException(
          "El nombre de la categoría es obligatorio",
        );
      // Ante empate de nombre global/empresa, prefiere la de la empresa.
      if (idEmpresa != null) {
        const propia = await this.categoriaRepository
          .createQueryBuilder("c")
          .where("c.id_empresa = :e", { e: idEmpresa })
          .andWhere("LOWER(c.nombre) = LOWER(:n)", { n: nombre })
          .getOne();
        if (propia) return propia.id;
      }
      const existente = await this.categoriaRepository
        .createQueryBuilder("c")
        .where("LOWER(c.nombre) = LOWER(:n)", { n: nombre })
        .andWhere("c.id_empresa IS NULL")
        .getOne();
      if (existente) return existente.id;
      const creada = await this.categoriaRepository.save(
        this.categoriaRepository.create({ nombre, idEmpresa }),
      );
      return creada.id;
    }
    if (idCategoria === undefined || idCategoria === null) return null;
    const categoria = await this.categoriaRepository.findOne({
      where: { id: idCategoria },
    });
    if (
      !categoria ||
      (categoria.idEmpresa != null && categoria.idEmpresa !== idEmpresa)
    ) {
      throw new BadRequestException(
        idEmpresa == null
          ? "Un insumo global sólo admite categorías globales"
          : "La categoría seleccionada no está disponible",
      );
    }
    return categoria.id;
  }
}
