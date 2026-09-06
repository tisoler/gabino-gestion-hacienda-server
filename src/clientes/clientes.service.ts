import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as admin from "firebase-admin";
import { EmpresaCliente } from "../entities/empresa-cliente.entity";
import { Empresa } from "../entities/empresa.entity";
import { Roles, ID_ROL_OPERARIO } from "src/constantes";
import type { UsuarioBasico } from "../cache/firestore-cache.service";
import { FirestoreCacheService } from "../cache/firestore-cache.service";

export interface ClienteVinculado {
  uid: string;
  email: string | null;
  nombreUsuario: string | null;
  photoURL: string | null;
  celular: string | null;
  roles: string[];
  rol: string | null;
  vinculadoDesde: Date | null;
}

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(EmpresaCliente)
    private empresaClienteRepository: Repository<EmpresaCliente>,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    private cache: FirestoreCacheService,
  ) {}

  /**
   * Lista los clientes vinculados a la empresa del usuario autenticado.
   * La relación viene de la tabla `empresa_cliente` (fuente de verdad) y se
   * enriquece con los datos del usuario desde Firestore (cache).
   */
  async findAll(user: any): Promise<ClienteVinculado[]> {
    const empresaId = user.currentEmpresaId;
    if (!empresaId) return [];

    const filas = await this.empresaClienteRepository.find({
      where: { idEmpresa: empresaId },
      order: { createdAt: "ASC" },
    });
    if (filas.length === 0) return [];

    const todos = await this.cache.getOrLoadUsuarios();
    const byUid = new Map<string, UsuarioBasico>(todos.map((u) => [u.uid, u]));

    return filas.map((f) => {
      const u = byUid.get(f.idCliente);
      const base: UsuarioBasico = u ?? {
        uid: f.idCliente,
        email: null,
        nombreUsuario: f.idCliente,
        photoURL: null,
        celular: null,
        roles: [],
        idEmpresas: [],
      };
      return {
        uid: base.uid,
        email: base.email,
        nombreUsuario: base.nombreUsuario,
        photoURL: base.photoURL,
        celular: base.celular,
        roles: base.roles,
        rol: base.roles[0] ?? null,
        vinculadoDesde: f.createdAt,
      };
    });
  }

  /**
   * Titulares posibles de un lote: los clientes vinculados a la empresa + el
   * anfitrión de la empresa (un anfitrión puede tener animales propios).
   */
  async findAllTitulares(user: any): Promise<ClienteVinculado[]> {
    const titulares = await this.findAll(user);
    const empresaId = user.currentEmpresaId;
    if (!empresaId) return titulares;

    const yaIncluidos = new Set(titulares.map((t) => t.uid));
    const todos = await this.cache.getOrLoadUsuarios();
    const anfitriones = todos
      .filter(
        (u) =>
          u.roles.includes(Roles.ANFITRION) &&
          u.idEmpresas.includes(empresaId) &&
          !yaIncluidos.has(u.uid),
      )
      .map((u) => ({
        uid: u.uid,
        email: u.email,
        nombreUsuario: u.nombreUsuario,
        photoURL: u.photoURL,
        celular: u.celular,
        roles: u.roles,
        rol: Roles.ANFITRION,
        vinculadoDesde: null,
      }));

    return [...titulares, ...anfitriones].sort((a, b) =>
      (a.nombreUsuario || "").localeCompare(b.nombreUsuario || "", "es"),
    );
  }

  /**
   * Usuarios candidatos a ser vinculados a mi empresa como cliente u operario:
   * usuarios con rol cliente o SIN rol (pendientes), que aún no están
   * vinculados como clientes. Los sys-admin no aparecen; los anfitriones y
   * operarios de otras empresas tampoco (ya tienen su propia empresa).
   */
  async findCandidatos(user: any): Promise<UsuarioBasico[]> {
    const todos = await this.cache.getOrLoadUsuarios();
    const candidatos = todos.filter(
      (u) => u.roles.includes(Roles.CLIENTE) || u.roles.length === 0,
    );

    const empresaId = user.currentEmpresaId;
    if (!empresaId) return candidatos;

    const vinculados = await this.empresaClienteRepository.find({
      where: { idEmpresa: empresaId },
      select: ["idCliente"],
    });
    const vinculadosSet = new Set(vinculados.map((v) => v.idCliente));
    return candidatos.filter((u) => !vinculadosSet.has(u.uid));
  }

  /**
   * Lista los operarios de la empresa del usuario autenticado: usuarios con
   * rol operario e `idEmpresa` = mi empresa (en Firestore).
   */
  async findOperarios(user: any): Promise<UsuarioBasico[]> {
    const empresaId = user.currentEmpresaId;
    if (!empresaId) return [];
    const todos = await this.cache.getOrLoadUsuarios();
    return todos
      .filter(
        (u) =>
          u.roles.includes(Roles.OPERARIO) && u.idEmpresas.includes(empresaId),
      )
      .sort((a, b) =>
        (a.nombreUsuario || "").localeCompare(b.nombreUsuario || "", "es"),
      );
  }

  /**
   * Vincula un usuario a la empresa del anfitrión.
   *  - rol "cliente" (default): inserta la fila en `empresa_cliente` y agrega
   *    la empresa al array `idEmpresas` del usuario en Firestore.
   *  - rol "operario": setea rol operario + `idEmpresa` (única) en Firestore y
   *    borra cualquier relación de cliente previa.
   */
  async vincular(
    uid: string,
    rol: string,
    user: any,
  ): Promise<{ ok: boolean }> {
    const empresaId = user.currentEmpresaId;
    if (!empresaId) {
      throw new BadRequestException("No tenés una empresa asociada");
    }

    const empresa = await this.empresaRepository.findOne({
      where: { id: empresaId, activo: true },
    });
    if (!empresa) {
      throw new NotFoundException("Empresa no encontrada");
    }

    // El destino debe ser un usuario con rol cliente o sin rol (pendiente).
    const todos = await this.cache.getOrLoadUsuarios();
    const target = todos.find((u) => u.uid === uid);
    if (
      !target ||
      !(target.roles.includes(Roles.CLIENTE) || target.roles.length === 0)
    ) {
      throw new NotFoundException(
        "Usuario no encontrado o no apto para ser vinculado a tu empresa",
      );
    }

    if (rol === "operario") {
      // Operario: rol + empresa única. Se borra cualquier relación de cliente
      // previa (fila + espejo array) para dejar el estado coherente.
      await this.empresaClienteRepository.delete({
        idEmpresa: empresaId,
        idCliente: uid,
      });
      const db = admin.firestore();
      await db.collection("usuarios").doc(uid).set(
        {
          idRol: ID_ROL_OPERARIO,
          idEmpresa: empresaId,
          idEmpresas: admin.firestore.FieldValue.delete(),
        },
        { merge: true },
      );
    } else {
      const existente = await this.empresaClienteRepository.findOne({
        where: { idEmpresa: empresaId, idCliente: uid },
      });
      if (!existente) {
        await this.empresaClienteRepository.insert({
          idEmpresa: empresaId,
          idCliente: uid,
        });
      }
      await this.agregarEmpresaEnFirestore(uid, empresaId);
    }

    this.cache.invalidateUser(uid);
    this.cache.invalidateAll();
    return { ok: true };
  }

  /**
   * Desvincula un usuario de la empresa:
   *  - operario: borra su `idEmpresa` en Firestore (mantiene el rol).
   *  - cliente: borra la fila de `empresa_cliente` y quita la empresa del
   *    array `idEmpresas`.
   */
  async desvincular(uid: string, user: any): Promise<{ ok: boolean }> {
    const empresaId = user.currentEmpresaId;
    if (!empresaId) {
      throw new BadRequestException("No tenés una empresa asociada");
    }

    const todos = await this.cache.getOrLoadUsuarios();
    const target = todos.find((u) => u.uid === uid);

    // Caso operario: pertenece a mi empresa con idEmpresa única.
    if (
      target?.roles.includes(Roles.OPERARIO) &&
      target.idEmpresas.includes(empresaId)
    ) {
      const db = admin.firestore();
      await db
        .collection("usuarios")
        .doc(uid)
        .set(
          { idEmpresa: admin.firestore.FieldValue.delete() },
          { merge: true },
        );
      this.cache.invalidateUser(uid);
      this.cache.invalidateAll();
      return { ok: true };
    }

    // Caso cliente: relación en empresa_cliente.
    const existente = await this.empresaClienteRepository.findOne({
      where: { idEmpresa: empresaId, idCliente: uid },
    });
    if (!existente) {
      throw new NotFoundException("Ese usuario no está vinculado a tu empresa");
    }
    await this.empresaClienteRepository.delete(existente.id);

    await this.quitarEmpresaEnFirestore(uid, empresaId);

    this.cache.invalidateUser(uid);
    this.cache.invalidateAll();
    return { ok: true };
  }

  /**
   * Promueve un cliente vinculado a operario de la empresa: setea su rol a
   * operario e `idEmpresa` (única) en Firestore, y deja de ser "cliente"
   * (se quita la relación de `empresa_cliente` y el espejo idEmpresas).
   */
  async promoverOperario(uid: string, user: any): Promise<{ ok: boolean }> {
    const empresaId = user.currentEmpresaId;
    if (!empresaId) {
      throw new BadRequestException("No tenés una empresa asociada");
    }

    const existente = await this.empresaClienteRepository.findOne({
      where: { idEmpresa: empresaId, idCliente: uid },
    });
    if (!existente) {
      throw new NotFoundException(
        "Ese usuario no está vinculado como cliente de tu empresa",
      );
    }

    await this.empresaClienteRepository.delete(existente.id);

    const db = admin.firestore();
    const userRef = db.collection("usuarios").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new NotFoundException(`Usuario ${uid} no encontrado en Firestore`);
    }
    // Operario: rol operario + empresa única. Se BORRA el array espejo (no un
    // array vacío): un `idEmpresas: []` opacaría la idEmpresa en resolveIdEmpresas.
    await userRef.set(
      {
        idRol: ID_ROL_OPERARIO,
        idEmpresa: empresaId,
        idEmpresas: admin.firestore.FieldValue.delete(),
      },
      { merge: true },
    );

    this.cache.invalidateUser(uid);
    this.cache.invalidateAll();
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Helpers Firestore (espejo denormalizado del array idEmpresas)
  // ---------------------------------------------------------------------------

  private async agregarEmpresaEnFirestore(uid: string, empresaId: number) {
    const db = admin.firestore();
    const userRef = db.collection("usuarios").doc(uid);
    const userDoc = await userRef.get();
    const current = userDoc.exists ? userDoc.data() || {} : {};
    const actuales = this.cache.resolveIdEmpresas(current);
    const next = Array.from(new Set([...actuales, empresaId])).sort(
      (a, b) => a - b,
    );
    await userRef.set({ idEmpresas: next }, { merge: true });
  }

  private async quitarEmpresaEnFirestore(uid: string, empresaId: number) {
    const db = admin.firestore();
    const userRef = db.collection("usuarios").doc(uid);
    const userDoc = await userRef.get();
    const current = userDoc.exists ? userDoc.data() || {} : {};
    const actuales = this.cache.resolveIdEmpresas(current);
    const next = actuales.filter((e) => e !== empresaId);
    if (next.length > 0) {
      await userRef.set({ idEmpresas: next }, { merge: true });
    } else {
      // Sin empresas: se borra el campo en vez de dejar un array vacío.
      await userRef.set(
        { idEmpresas: admin.firestore.FieldValue.delete() },
        { merge: true },
      );
    }
  }
}
