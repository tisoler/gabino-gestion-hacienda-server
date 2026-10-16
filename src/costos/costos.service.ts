import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { Costo } from "../entities/costo.entity";
import { Roles } from "src/constantes";
import { capitalizarNombre } from "../utils/nombres.util";
import { CreateCostoDto } from "./dto/create-costo.dto";
import { UpdateCostoDto } from "./dto/update-costo.dto";

@Injectable()
export class CostosService {
  constructor(
    @InjectRepository(Costo)
    private costoRepository: Repository<Costo>,
  ) {}

  private empresaActual(user: any): number | null {
    const id = user?.currentEmpresaId ?? null;
    return id ? Number(id) : null;
  }

  private esSysAdmin(user: any): boolean {
    return !!user?.roles?.includes(Roles.SYS_ADMIN);
  }

  private puedeVerTodo(user: any): boolean {
    return !!user?.permisos?.includes("escritura:costo");
  }

  /**
   * Lista costos visibles: por defecto GLOBALES + empresa actual. `scope`
   * refina ('global' | 'empresa' | 'todas'); `idEmpresa` sólo sys-admin.
   * `estado='todas'` incluye desactivados (sólo con escritura:costo).
   */
  async listar(
    user: any,
    estado?: string,
    scope?: string,
    idEmpresa?: number,
  ): Promise<Costo[]> {
    const admin = this.esSysAdmin(user);
    let empresa: number | null;
    if (admin) {
      empresa = idEmpresa ?? this.empresaActual(user);
    } else {
      empresa = this.empresaActual(user);
      if (!empresa) return [];
    }

    const verTodas = estado === "todas" && this.puedeVerTodo(user);
    const qb = this.costoRepository.createQueryBuilder("c");
    if (scope === "global") {
      qb.where("c.id_empresa IS NULL");
    } else if (scope === "empresa") {
      if (!empresa) return [];
      qb.where("c.id_empresa = :e", { e: empresa });
    } else if (admin && !empresa) {
      qb.where("1 = 1");
    } else {
      qb.where("c.id_empresa IS NULL OR c.id_empresa = :e", { e: empresa });
    }
    if (!verTodas) qb.andWhere("c.activo = true");
    return qb.orderBy("LOWER(c.nombre)", "ASC").getMany();
  }

  /**
   * Crea un costo. El sys-admin elige el alcance (`idEmpresa` null = GLOBAL);
   * el resto crea para su empresa actual.
   */
  async crear(dto: CreateCostoDto, user: any): Promise<Costo> {
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
      throw new BadRequestException("El nombre del costo es obligatorio");
    await this.assertNombreUnico(nombre, idEmpresa);

    return this.costoRepository.save(
      this.costoRepository.create({
        nombre,
        descripcion: dto.descripcion?.trim() || null,
        idEmpresa,
        precioReferencia: dto.precioReferencia ?? null,
        activo: true,
      }),
    );
  }

  /**
   * Resuelve un costo para imputar: existente (`idCosto`, global o de la
   * empresa) o nuevo por nombre (se crea con el alcance correspondiente,
   * mismo mecanismo que insumos/categorías inline).
   */
  async resolverCosto(
    ref: { idCosto?: number | null; nombre?: string | null },
    empresaId: number,
  ): Promise<Costo> {
    if (ref.idCosto != null) {
      const costo = await this.costoRepository.findOne({
        where: { id: ref.idCosto },
      });
      if (!costo || !costo.activo)
        throw new BadRequestException("Costo no encontrado");
      if (costo.idEmpresa != null && costo.idEmpresa !== empresaId) {
        throw new BadRequestException("Un costo no pertenece a tu empresa");
      }
      return costo;
    }
    const nombre = capitalizarNombre(ref.nombre ?? "");
    if (!nombre) throw new BadRequestException("Falta el costo");
    const existente = await this.costoRepository.findOne({
      where: [
        { idEmpresa: IsNull(), nombre },
        { idEmpresa: empresaId, nombre },
      ],
    });
    if (existente) return existente;
    return this.costoRepository.save(
      this.costoRepository.create({
        nombre,
        descripcion: null,
        idEmpresa: empresaId,
        precioReferencia: null,
        activo: true,
      }),
    );
  }

  /**
   * Edita un costo. Uno GLOBAL sólo lo modifica el sys-admin; sólo él cambia
   * el alcance.
   */
  async actualizar(id: number, dto: UpdateCostoDto, user: any): Promise<Costo> {
    const costo = await this.getCostoVerificado(id, user);
    const admin = this.esSysAdmin(user);

    if (dto.idEmpresa !== undefined && dto.idEmpresa !== costo.idEmpresa) {
      if (!admin) {
        throw new ForbiddenException(
          "No tiene permisos para cambiar el alcance del costo",
        );
      }
      await this.assertNombreUnico(costo.nombre, dto.idEmpresa, id);
      costo.idEmpresa = dto.idEmpresa;
    }

    if (dto.nombre !== undefined) {
      const nombre = capitalizarNombre(dto.nombre);
      if (!nombre)
        throw new BadRequestException("El nombre del costo es obligatorio");
      if (nombre !== costo.nombre) {
        await this.assertNombreUnico(nombre, costo.idEmpresa, id);
        costo.nombre = nombre;
      }
    }

    if (dto.descripcion !== undefined) {
      costo.descripcion = dto.descripcion?.trim() || null;
    }

    if (dto.precioReferencia !== undefined) {
      costo.precioReferencia = dto.precioReferencia ?? null;
    }

    if (dto.activo !== undefined) {
      costo.activo = dto.activo;
    }

    await this.costoRepository.save(costo);
    return costo;
  }

  /** Activa/desactiva el costo entero (manual). */
  async toggleActivo(id: number, activo: boolean, user: any): Promise<Costo> {
    const costo = await this.getCostoVerificado(id, user);
    costo.activo = activo;
    await this.costoRepository.save(costo);
    return costo;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getCostoVerificado(id: number, user: any): Promise<Costo> {
    const costo = await this.costoRepository.findOne({ where: { id } });
    if (!costo) throw new NotFoundException("Costo no encontrado");
    if (costo.idEmpresa == null) {
      if (!this.esSysAdmin(user)) {
        throw new ForbiddenException(
          "Los costos globales sólo los gestiona el administrador",
        );
      }
      return costo;
    }
    if (!this.esSysAdmin(user)) {
      const empresaId = this.empresaActual(user);
      if (!empresaId || costo.idEmpresa !== empresaId) {
        throw new ForbiddenException("No tiene permisos sobre este costo");
      }
    }
    return costo;
  }

  /** Nombre único por alcance (global o empresa), case-insensitive. */
  private async assertNombreUnico(
    nombre: string,
    idEmpresa: number | null,
    excluirId?: number,
  ) {
    const existente = await this.costoRepository.findOne({
      where: { idEmpresa: idEmpresa ?? IsNull(), nombre },
    });
    if (existente && existente.id !== excluirId) {
      throw new BadRequestException(
        idEmpresa == null
          ? "Ya existe un costo global con ese nombre"
          : "Ya existe un costo con ese nombre en tu empresa",
      );
    }
  }
}
