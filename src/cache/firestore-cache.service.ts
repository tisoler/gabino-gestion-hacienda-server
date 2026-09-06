import { Injectable } from "@nestjs/common";
import * as admin from "firebase-admin";
import { Roles } from "src/constantes";

/**
 * Datos resueltos de un usuario para autenticación (lo que el FE necesita por
 * request: empresas, roles y permisos). Se cachea por UID para no leer
 * Firestore en cada request.
 */
export interface CachedAuthUser {
  idEmpresas: number[];
  roles: string[];
  permisos: string[];
}

/**
 * Datos básicos de un usuario (para pickers, listados de clientes, etc.).
 * Se arma a partir de Firestore + Firebase Auth.
 */
export interface UsuarioBasico {
  uid: string;
  email: string | null;
  nombreUsuario: string | null;
  photoURL: string | null;
  celular: string | null;
  roles: string[];
  idEmpresas: number[];
}

interface Entry<T> {
  data: T;
  exp: number;
}

const DEFAULT_AUTH_TTL_MS = 4 * 60 * 60 * 1000; // 4 hs
const DEFAULT_USUARIOS_TTL_MS = 4 * 60 * 60 * 1000; // 4 hs

const ttlDe = (envKey: string, fallback: number): number => {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/**
 * Cache en memoria (por proceso) para reducir lecturas de Firestore:
 *  - Auth por UID (idEmpresas + roles + permisos), TTL configurable.
 *  - Listado de usuarios enriquecido (todos los no sys-admin), TTL horas.
 *
 * Invalidación:
 *  - Por UID: cuando cambian asociaciones de empresas o rol de un usuario.
 *  - Global: vía POST /cache/invalidate (botón de settings) y tras crear
 *    empresa (auto-asociación del creador) o vincular/desvincular clientes.
 *
 * TTLs por env: CACHE_AUTH_TTL, CACHE_USUARIOS_TTL (milisegundos).
 */
@Injectable()
export class FirestoreCacheService {
  private readonly authCache = new Map<string, Entry<CachedAuthUser>>();
  private usuariosCache: Entry<UsuarioBasico[]> | null = null;
  private readonly authTtl = ttlDe("CACHE_AUTH_TTL", DEFAULT_AUTH_TTL_MS);
  private readonly usuariosTtl = ttlDe(
    "CACHE_USUARIOS_TTL",
    DEFAULT_USUARIOS_TTL_MS,
  );

  // ---------------------------------------------------------------------------
  // Auth por usuario
  // ---------------------------------------------------------------------------
  getAuth(uid: string): CachedAuthUser | null {
    const e = this.authCache.get(uid);
    if (!e) return null;
    if (Date.now() > e.exp) {
      this.authCache.delete(uid);
      return null;
    }
    return e.data;
  }

  setAuth(uid: string, data: CachedAuthUser) {
    this.authCache.set(uid, { data, exp: Date.now() + this.authTtl });
  }

  invalidateUser(uid: string) {
    this.authCache.delete(uid);
  }

  /**
   * Devuelve los datos de auth de un usuario, cargándolos desde Firestore y
   * cacheándolos si hace falta. Siempre incluye permisos reales (no vacíos).
   * Devuelve null si el doc no existe.
   *
   * Resuelve idEmpresas de forma tolerante: un anfitrión/operario guarda su
   * empresa en el campo singular `idEmpresa`; un cliente puede tener el
   * array `idEmpresas` (espejo denormalizado de la tabla empresa_cliente).
   */
  async getOrLoadAuth(uid: string): Promise<CachedAuthUser | null> {
    const cached = this.getAuth(uid);
    if (cached) return cached;

    const db = admin.firestore();
    const userDoc = await db.collection("usuarios").doc(uid).get();
    if (!userDoc.exists) return null;

    const userData = userDoc.data();

    // Permisos del rol
    let permisos: string[] = [];
    let roles: string[] = [];
    const rolId = userData?.idRol;
    if (rolId) {
      const roleDoc = await db.collection("roles").doc(String(rolId)).get();
      const roleData = roleDoc.data();
      if (roleData?.permisos && roleData.permisos.length > 0) {
        const permisosDoc = await db
          .collection("permisos")
          .where(
            admin.firestore.FieldPath.documentId(),
            "in",
            roleData.permisos,
          )
          .get();
        permisos = permisosDoc.docs.map((doc) => doc.data().nombre || doc.id);
      }
      roles = roleData ? [roleData.nombre] : [];
    }

    const idEmpresas = this.resolveIdEmpresas(userData);

    const data: CachedAuthUser = { idEmpresas, roles, permisos };
    this.setAuth(uid, data);
    return data;
  }

  // ---------------------------------------------------------------------------
  // Listado de usuarios
  // ---------------------------------------------------------------------------
  getUsuarios(): UsuarioBasico[] | null {
    if (!this.usuariosCache) return null;
    if (Date.now() > this.usuariosCache.exp) {
      this.usuariosCache = null;
      return null;
    }
    return this.usuariosCache.data;
  }

  setUsuarios(data: UsuarioBasico[]) {
    this.usuariosCache = { data, exp: Date.now() + this.usuariosTtl };
  }

  /**
   * Devuelve el listado de usuarios (no sys-admin) enriquecido con Firebase
   * Auth, cargándolo y cacheándolo si hace falta.
   */
  async getOrLoadUsuarios(): Promise<UsuarioBasico[]> {
    const cached = this.getUsuarios();
    if (cached) return cached;
    const lista = await this.buildUsuarios();
    this.setUsuarios(lista);
    return lista;
  }

  invalidateAll() {
    this.authCache.clear();
    this.usuariosCache = null;
  }

  // ---------------------------------------------------------------------------
  // Construcción del listado (roles + usuarios + Auth en batch)
  // ---------------------------------------------------------------------------
  private async buildUsuarios(): Promise<UsuarioBasico[]> {
    const db = admin.firestore();

    // Resolver roles por idRol (FK → roles.nombre), tolerando schemas variados.
    const rolesSnap = await db.collection("roles").get();
    const roleById = new Map<string, string>();
    for (const doc of rolesSnap.docs) {
      const nombre = doc.data()?.nombre;
      if (typeof nombre === "string" && nombre) {
        roleById.set(doc.id, nombre);
      }
    }

    const usersSnap = await db.collection("usuarios").get();
    const candidatos: {
      docId: string;
      data: any;
      roles: string[];
      idEmpresas: number[];
    }[] = [];

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const roles = this.resolveRoles(data, roleById);
      // Se incluyen usuarios sin rol (roles: []) para que sys-admin pueda
      // asignarles uno (PATCH /usuarios/:uid/rol). Sólo se excluyen sys-admins.
      if (roles.includes(Roles.SYS_ADMIN)) {
        continue;
      }
      candidatos.push({
        docId: doc.id,
        data,
        roles,
        idEmpresas: this.resolveIdEmpresas(data),
      });
    }

    if (candidatos.length === 0) return [];

    // Enriquecer con Firebase Auth: nombre/email pueden faltar en Firestore.
    const authByUid = await this.fetchAuthRecords(
      candidatos.map((c) => c.docId),
    );

    return candidatos.map(({ docId, data, roles, idEmpresas }) => {
      const auth = authByUid.get(docId);
      return {
        uid: docId,
        email: auth?.email ?? data?.email ?? null,
        // Nombre: priorizar Firestore (controlado por el admin), luego Auth.
        nombreUsuario:
          data?.nombre ??
          data?.nombreUsuario ??
          auth?.displayName ??
          auth?.email ??
          docId,
        photoURL: data?.picture ?? data?.photoURL ?? auth?.photoURL ?? null,
        celular:
          typeof data?.celular === "string" && data.celular.trim() !== ""
            ? data.celular.trim()
            : null,
        roles,
        idEmpresas,
      };
    });
  }

  private resolveRoles(data: any, roleById: Map<string, string>): string[] {
    if (Array.isArray(data?.roles) && data.roles.length > 0) {
      return data.roles.map((r: any) => String(r));
    }
    if (data?.rol) {
      return [String(data.rol)];
    }
    // `idRol` puede venir como número (ej. 4) aunque los doc-ids de la
    // colección "roles" son strings; normalizar antes de buscar en el Map.
    const idRolKey = data?.idRol != null ? String(data.idRol) : null;
    if (idRolKey && roleById.has(idRolKey)) {
      return [roleById.get(idRolKey)!];
    }
    return [];
  }

  /**
   * Resuelve las empresas de un usuario tolerando los dos formatos:
   *   - `idEmpresa`: escalar único (anfitrión / operario).
   *   - `idEmpresas`: array de ids (clientes multi-empresa).
   *
   * `idEmpresa` se prioriza sobre `idEmpresas`: un anfitrión/operario puede
   * tener un array vacío como residuo de un cambio de rol, y ese array no
   * debe ocultar la empresa ya asignada en `idEmpresa`.
   */
  resolveIdEmpresas(data: any): number[] {
    if (data?.idEmpresa !== undefined && data?.idEmpresa !== null) {
      const n = Number(data.idEmpresa);
      if (Number.isFinite(n) && n > 0) return [n];
    }
    if (Array.isArray(data?.idEmpresas)) {
      return data.idEmpresas
        .map((e: any) => Number(e))
        .filter((n: number) => Number.isFinite(n) && n > 0);
    }
    if (data?.idEmpresas !== undefined && data?.idEmpresas !== null) {
      const n = Number(data.idEmpresas);
      return Number.isFinite(n) && n > 0 ? [n] : [];
    }
    return [];
  }

  /**
   * Batch-fetch de Firebase Auth records (hasta 100 por llamada).
   * Devuelve un Map uid → UserRecord. Si un uid no existe en Auth, se ignora.
   */
  private async fetchAuthRecords(
    uids: string[],
  ): Promise<Map<string, admin.auth.UserRecord>> {
    const result = new Map<string, admin.auth.UserRecord>();
    if (uids.length === 0) return result;

    const chunks: string[][] = [];
    for (let i = 0; i < uids.length; i += 100) {
      chunks.push(uids.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      try {
        const res = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
        for (const rec of res.users) {
          result.set(rec.uid, rec);
        }
      } catch (err) {
        console.warn("[cache] No se pudo enriquecer con Firebase Auth:", err);
      }
    }

    return result;
  }
}
