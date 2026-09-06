import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import * as admin from "firebase-admin";
import {
  ID_ROL_ANFITRION,
  ID_ROL_CLIENTE,
  ID_ROL_OPERARIO,
} from "src/constantes";
import type { UsuarioBasico } from "../cache/firestore-cache.service";
import { FirestoreCacheService } from "../cache/firestore-cache.service";

@Injectable()
export class UsuariosService {
  constructor(private cache: FirestoreCacheService) {}

  /**
   * Bootstrap de usuarios nuevos (signup): crea el documento `usuarios/{uid}`
   * en Firestore si no existe, con `idRol: null` (sin rol, pendiente de que
   * sys-admin le asigne uno), el nombre de la cuenta y el celular opcional.
   * No pisa documentos existentes.
   *
   * El BE usa el admin SDK (ignora las reglas de seguridad del cliente) y
   * después invalida los caches para que el usuario nuevo aparezca de inmediato.
   */
  async bootstrapUsuario(
    user: any,
    celularRaw?: string,
  ): Promise<{ ok: boolean }> {
    const uid = user.id;
    const db = admin.firestore();
    const ref = db.collection("usuarios").doc(uid);

    const snap = await ref.get();
    if (!snap.exists) {
      let nombre = typeof user.email === "string" ? user.email : "";
      try {
        const record = await admin.auth().getUser(uid);
        nombre = record.displayName || record.email || nombre;
      } catch {
        /* sin acceso a Auth: seguimos con el email */
      }
      const doc: Record<string, unknown> = {
        // Sin rol: un usuario nuevo queda pendiente hasta que sys-admin le
        // asigne anfitrión, cliente u operario (PATCH /usuarios/:uid/rol).
        idRol: null,
        nombre,
      };
      // El celular es opcional y NO debe impedir la creación del documento.
      try {
        const celular = this.normalizarCelular(celularRaw);
        if (celular) doc.celular = celular;
      } catch {
        console.warn(
          "[usuarios] Celular inválido en bootstrap, se ignora:",
          celularRaw,
        );
      }
      await ref.set(doc);
    }

    this.cache.invalidateUser(uid);
    this.cache.invalidateAll();
    return { ok: true };
  }

  /**
   * Lista todos los usuarios de Firestore aptos para ser asociados a una
   * empresa (cualquier rol excepto sys-admin, incluidos los que aún no tienen
   * rol asignado). Alimenta pickers y la vista de usuarios de sys-admin.
   */
  async findCandidatos(): Promise<UsuarioBasico[]> {
    return this.cache.getOrLoadUsuarios();
  }

  /**
   * Asigna el rol de un usuario (anfitrión, operario o cliente). Sólo
   * sys-admin. Actualiza `idRol` en su documento de Firestore y limpia el
   * campo de empresa que no corresponde al rol para dejar el estado coherente:
   *  - anfitrión: empresa única pendiente de crear (se limpia idEmpresa/idEmpresas).
   *  - operario: empresa única (idEmpresa) cuando el anfitrión lo asocie.
   *  - cliente: multi-empresa (array idEmpresas).
   */
  async updateRol(
    uid: string,
    idRol: number,
    user: any,
  ): Promise<UsuarioBasico> {
    if (!uid || typeof uid !== "string") {
      throw new BadRequestException("uid es requerido");
    }
    if (!user.roles?.includes("sys-admin")) {
      throw new ForbiddenException(
        "Sólo sys-admin puede asignar roles a los usuarios",
      );
    }

    const db = admin.firestore();
    const deleteField = admin.firestore.FieldValue.delete();
    const userRef = db.collection("usuarios").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new NotFoundException(`Usuario ${uid} no encontrado en Firestore`);
    }
    const currentData = userDoc.data() || {};

    const patch: Record<string, unknown> = { idRol };
    // Estado para la respuesta (sin sentinels de FieldValue).
    const responseData: Record<string, unknown> = { ...currentData, idRol };

    if (idRol === ID_ROL_ANFITRION) {
      // El anfitrión crea su empresa (POST /empresas) que le setea idEmpresa.
      // Se BORRA idEmpresas (no un array vacío): un array vacío opacaría una
      // idEmpresa posterior en resolveIdEmpresas.
      patch.idEmpresa = deleteField;
      patch.idEmpresas = deleteField;
      responseData.idEmpresa = null;
      responseData.idEmpresas = [];
    } else if (idRol === ID_ROL_OPERARIO) {
      // El operario tiene empresa única (idEmpresa, la setea el anfitrión al
      // promoverlo). Se borra el array idEmpresas.
      patch.idEmpresas = deleteField;
      responseData.idEmpresas = [];
    } else if (idRol === ID_ROL_CLIENTE) {
      // El cliente usa el array idEmpresas (relación multi-empresa).
      patch.idEmpresa = deleteField;
      responseData.idEmpresa = null;
    }

    await userRef.set(patch, { merge: true });

    this.cache.invalidateUser(uid);
    this.cache.invalidateAll();

    return this.buildBasico(uid, responseData);
  }

  /**
   * Agrega/edita el nombre de un usuario, guardándolo en su documento
   * `usuarios/{uid}` de Firestore (campo `nombre`). Un usuario no-sys-admin
   * sólo puede editarse a sí mismo.
   */
  async updateNombre(
    uid: string,
    nombreRaw: string,
    user: any,
  ): Promise<UsuarioBasico> {
    if (!uid || typeof uid !== "string") {
      throw new BadRequestException("uid es requerido");
    }
    const nombre = nombreRaw?.trim();
    if (!nombre) {
      throw new BadRequestException("El nombre no puede estar vacío");
    }

    const isAdmin = user.roles?.includes("sys-admin");
    if (!isAdmin && uid !== user.id) {
      throw new ForbiddenException(
        "No tiene permisos para editar el nombre de este usuario",
      );
    }

    const db = admin.firestore();
    const userRef = db.collection("usuarios").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new NotFoundException(`Usuario ${uid} no encontrado en Firestore`);
    }
    const currentData = userDoc.data() || {};

    await userRef.update({ nombre });

    this.cache.invalidateUser(uid);
    this.cache.invalidateAll();

    return this.buildBasico(uid, currentData, nombre);
  }

  /**
   * Agrega/edita el celular (WhatsApp) de un usuario. Enviar string vacío
   * para borrarlo. Un usuario no-sys-admin sólo puede editarse a sí mismo.
   */
  async updateCelular(
    uid: string,
    celularRaw: string | undefined,
    user: any,
  ): Promise<UsuarioBasico> {
    if (!uid || typeof uid !== "string") {
      throw new BadRequestException("uid es requerido");
    }
    const celular = celularRaw?.trim()
      ? this.normalizarCelular(celularRaw)
      : null;

    const isAdmin = user.roles?.includes("sys-admin");
    if (!isAdmin && uid !== user.id) {
      throw new ForbiddenException(
        "No tiene permisos para editar el celular de este usuario",
      );
    }

    const db = admin.firestore();
    const userRef = db.collection("usuarios").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new NotFoundException(`Usuario ${uid} no encontrado en Firestore`);
    }
    const currentData = userDoc.data() || {};

    await userRef.update({ celular });

    this.cache.invalidateUser(uid);
    this.cache.invalidateAll();

    return this.buildBasico(uid, currentData, undefined, celular);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async buildBasico(
    uid: string,
    currentData: any,
    nombreOverride?: string,
    celularOverride?: string | null,
  ): Promise<UsuarioBasico> {
    const authMap = await this.fetchAuthRecords([uid]);
    const auth = authMap.get(uid);
    const roles = this.resolveRoles(currentData);
    return {
      uid,
      email: auth?.email ?? currentData?.email ?? null,
      nombreUsuario:
        nombreOverride ??
        currentData?.nombre ??
        currentData?.nombreUsuario ??
        auth?.displayName ??
        auth?.email ??
        uid,
      photoURL:
        currentData?.picture ?? currentData?.photoURL ?? auth?.photoURL ?? null,
      celular:
        celularOverride !== undefined
          ? celularOverride
          : typeof currentData?.celular === "string" &&
              currentData.celular.trim() !== ""
            ? currentData.celular.trim()
            : null,
      roles,
      idEmpresas: this.cache.resolveIdEmpresas(currentData),
    };
  }

  private resolveRoles(data: any): string[] {
    if (Array.isArray(data?.roles) && data.roles.length > 0) {
      return data.roles.map((r: any) => String(r));
    }
    if (data?.rol) return [String(data.rol)];
    if (data?.idRol != null) return [String(data.idRol)];
    return [];
  }

  /**
   * Normaliza un celular a formato internacional E.164 (ej: +5491122334455).
   */
  private normalizarCelular(raw?: string): string | null {
    if (typeof raw !== "string") return null;
    const limpio = raw.replace(/[\s\-().]/g, "");
    if (limpio === "") return null;
    if (!/^\+\d{8,15}$/.test(limpio)) {
      throw new BadRequestException(
        "El celular debe estar en formato internacional, ej: +5491122334455",
      );
    }
    return limpio;
  }

  private async fetchAuthRecords(
    uids: string[],
  ): Promise<Map<string, admin.auth.UserRecord>> {
    const result = new Map<string, admin.auth.UserRecord>();
    if (uids.length === 0) return result;
    try {
      const res = await admin.auth().getUsers(uids.map((uid) => ({ uid })));
      for (const rec of res.users) result.set(rec.uid, rec);
    } catch (err) {
      console.warn("[usuarios] No se pudo enriquecer con Firebase Auth:", err);
    }
    return result;
  }
}
