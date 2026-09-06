import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as admin from "firebase-admin";
import { Empresa } from "../entities/empresa.entity";
import { Roles } from "src/constantes";
import { CreateEmpresaDto } from "./dto/create-empresa.dto";
import { UpdateEmpresaDto } from "./dto/update-empresa.dto";
import { FirestoreCacheService } from "../cache/firestore-cache.service";

@Injectable()
export class EmpresasService {
  constructor(
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    private cache: FirestoreCacheService,
  ) {}

  findAll(user: any): Promise<Empresa[]> {
    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);
    const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
      Number(e),
    );

    if (isAdmin) {
      return this.empresaRepository.find({
        where: { activo: true },
        order: { nombre: "ASC" },
      });
    }

    if (userEmpresas.length === 0) return Promise.resolve([]);

    return this.empresaRepository
      .createQueryBuilder("empresa")
      .where("empresa.id IN (:...ids)", { ids: userEmpresas })
      .andWhere("empresa.activo = :activo", { activo: true })
      .orderBy("empresa.nombre", "ASC")
      .getMany();
  }

  findOne(id: number): Promise<Empresa | null> {
    if (!id) return Promise.resolve(null);
    return this.empresaRepository.findOne({ where: { id } });
  }

  /**
   * Devuelve la empresa del usuario autenticado (la única de un anfitrión /
   * operario, o la primera visible de un cliente multi-empresa).
   */
  async findMine(user: any): Promise<Empresa | null> {
    const id = user.currentEmpresaId ?? user.idEmpresas?.[0];
    if (!id) return null;
    return this.findOne(Number(id));
  }

  /**
   * Crea una empresa.
   *
   * - sys-admin: puede crear empresas sin asociarse.
   * - anfitrión: crea su única empresa; se le setea `idEmpresa` en su
   *   documento de Firestore (un anfitrión tiene UNA sola empresa) y se
   *   invalidan los caches. El rol ya lo asignó sys-admin (PATCH /usuarios/:uid/rol).
   */
  async create(
    createEmpresaDto: CreateEmpresaDto,
    user: any,
  ): Promise<Empresa> {
    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);

    if (!isAdmin) {
      const db = admin.firestore();
      const userRef = db.collection("usuarios").doc(user.id);
      const userDoc = await userRef.get();
      const current = userDoc.exists ? userDoc.data() || {} : {};
      const currentEmpresas = this.cache.resolveIdEmpresas(current);
      if (currentEmpresas.length > 0) {
        throw new BadRequestException(
          "Ya tenés una empresa asociada. Un anfitrión tiene una sola empresa.",
        );
      }
    }

    const empresa = this.empresaRepository.create({
      ...createEmpresaDto,
      nombre: this.capitalizarNombreEmpresa(createEmpresaDto.nombre),
    });
    const saved = await this.empresaRepository.save(empresa);

    // Asociar el anfitrión (no-admin) a su nueva empresa.
    if (!isAdmin && user.id) {
      try {
        const db = admin.firestore();
        const userRef = db.collection("usuarios").doc(user.id);
        await userRef.set({ idEmpresa: saved.id }, { merge: true });
      } catch (err) {
        console.warn(
          "[empresas] No se pudo auto-asociar al creador de la empresa:",
          err,
        );
      }
      // La asociación cambió: invalidar cache de auth y listado.
      this.cache.invalidateUser(user.id);
      this.cache.invalidateAll();
    }

    return saved;
  }

  /**
   * Actualiza los datos de una empresa (nombre, dirección, teléfono).
   * El nombre se normaliza a mayúscula inicial por palabra (salvo "y").
   *
   * Reglas:
   *  - sys-admin: puede editar cualquier empresa.
   *  - anfitrión: sólo su propia empresa.
   *  - operario / cliente: no autorizados (los bloquea el controller).
   */
  async update(
    id: number,
    updateEmpresaDto: UpdateEmpresaDto,
    user: any,
  ): Promise<Empresa> {
    const empresa = await this.findOne(id);
    if (!empresa) {
      throw new NotFoundException("Empresa no encontrada");
    }

    const isAdmin = user.roles?.includes(Roles.SYS_ADMIN);
    if (!isAdmin) {
      const userEmpresas: number[] = (user.idEmpresas || []).map((e: any) =>
        Number(e),
      );
      if (!userEmpresas.includes(id)) {
        throw new ForbiddenException(
          "No tiene permisos para modificar esta empresa",
        );
      }
    }

    if (updateEmpresaDto.nombre != null) {
      empresa.nombre = this.capitalizarNombreEmpresa(updateEmpresaDto.nombre);
    }
    if (updateEmpresaDto.direccion !== undefined) {
      empresa.direccion = updateEmpresaDto.direccion ?? null;
    }
    if (updateEmpresaDto.telefono !== undefined) {
      empresa.telefono = updateEmpresaDto.telefono ?? null;
    }
    return this.empresaRepository.save(empresa);
  }

  /**
   * Normaliza el nombre de una empresa: primera letra de cada palabra en
   * mayúscula y el resto en minúscula, salvo la palabra "y".
   */
  private capitalizarNombreEmpresa(nombre: string): string {
    return nombre
      .split(/\s+/)
      .filter(Boolean)
      .map((palabra) => {
        const lower = palabra.toLowerCase();
        if (lower === "y") return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(" ");
  }
}
