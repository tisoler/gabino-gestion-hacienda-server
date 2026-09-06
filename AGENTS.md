# AGENTS.md — Gabino Gestión de Hacienda · Server

Guía para agentes y desarrolladores que trabajan en el backend (repositorio separado).

## Stack

NestJS + TypeORM + PostgreSQL. Autenticación Firebase (admin SDK). Prefijo `/api`, puerto `3055`.
Package manager: **pnpm**.

## Comandos

```bash
pnpm install          # instalar dependencias
pnpm run start:dev    # desarrollo (watch) → http://localhost:3055/api
pnpm build            # nest build (tsc)
pnpm run lint         # eslint + prettier (--fix)
```

El lint usa `.eslintrc.js` (recomendado + prettier, `--fix`).

## Reglas de oro

1. **Migraciones manuales**: `TypeORM` usa `synchronize: false`. Cualquier cambio de esquema
   requiere un archivo nuevo en `migrations/` (numerado, ej. `002-*.sql`) y hay que aplicarlo
   a mano. NO modificar el esquema solo con entidades.
2. **Identidad en Firestore, relaciones en la BD**: los usuarios/roles/permisos viven en
   Firestore (`usuarios`, `roles`, `permisos`). Las relaciones de dominio (empresa↔cliente)
   y las tablas de negocio viven en Postgres. NO duplicar identidad en la BD.
3. **`FirestoreCacheService`** (`src/cache`): todo acceso a usuarios/roles/permisos pasa por
   cache (memoria, TTL horas). Ante cambios de roles/permisos/asociaciones usar
   `POST /cache/invalidate` (sólo sys-admin). Los mutadores invalidan por UID + global.
4. **Empresa única del anfitrión**: un usuario con rol anfitrión/operario guarda `idEmpresa`
   (singular) en Firestore. Un cliente lleva el array `idEmpresas` (espejo denormalizado de
   `empresa_cliente`). `FirestoreCacheService.resolveIdEmpresas` tolera ambos formatos y
   **prioriza `idEmpresa`** (un array vacío de `idEmpresas` no debe opacar una empresa ya
   asignada). Al cambiar de rol, BORRAR el campo sobrante con `admin.firestore.FieldValue.delete()`
   en vez de dejar arrays vacíos. Usar siempre `resolveIdEmpresas`, no inventar otra resolución.
5. **Header `x-empresa-id`**: lo manda el FE desde `currentEmpresaId` (anfitrión/operario/
   cliente) o `adminEmpresaId` (sys-admin elige empresa puntual). La `FirebaseStrategy` lo
   valida contra `idEmpresas` del usuario.
6. **Signup sin rol**: el `POST /usuarios/bootstrap` crea `usuarios/{uid}` con el Admin SDK
   (`idRol: null`, pendiente); el FE sólo llama a ese endpoint y nunca escribe directo a
   Firestore (igual que gabino-agrogestion). Sólo sys-admin asigna rol
   (`PATCH /usuarios/:uid/rol`, roles asignables 2/3/4). El listado `getOrLoadUsuarios`
   incluye a los usuarios sin rol para que sys-admin los habilite.
7. **Ubicación derivada (corrales)**: un corral COMÚN aloja UN lote activo → estado
   libre/ocupado se DERIVA de `lote.id_corral` (no se almacena). La ubicación de un animal es
   `animal.id_corral_enfermeria ?? lote.id_corral`: el campo del animal sólo marca la EXCEPCIÓN
   de enfermería, y al "traer" se limpia (vuelve al corral ACTUAL del lote automáticamente).
   Validaciones en `LotesService.validarCorralComunLibre` y `CorralesService.toggleActivo`.
   `enviarEnfermeria` acepta reasignación entre enfermerías vía `idCorral` (drag & drop del mapa).
8. **Aislamiento del cliente**: en `LotesService`, los usuarios con rol cliente sólo ven/acceden
   a lotes con `id_cliente = uid` (en `findAll` y `getLoteVerificado`). En `CorralesService.mapa`,
   un cliente sólo ve los corrales de SUS lotes y en las enfermerías únicamente animales de sus
   lotes (la vista `/corrales` completa y `/corrales/enfermerias` están bloqueadas por `@Roles`).
   Mantener esto al ampliar.

## Módulos

- **auth**: `FirebaseStrategy` (valida ID token + resuelve `idEmpresas`, `roles`, `permisos`),
  guards (`firebase`, `firebase-bootstrap`, `roles`, `permissions`), `GET /auth/me`.
- **cache**: `FirestoreCacheService` + `POST /cache/invalidate`.
- **empresas**: `GET /empresas` · `GET /empresas/me` · `POST /empresas` (el anfitrión crea su
  única empresa; el rol ya lo asignó sys-admin) · `PATCH /empresas/:id` (nombre/dirección/teléfono).
- **clientes**: `GET /clientes` · `GET /clientes/operarios` · `GET /clientes/candidatos` ·
  `POST /clientes { uid, rol: 'cliente'|'operario' }` (vincular) ·
  `PATCH /clientes/:uid/rol` (promover a operario) · `DELETE /clientes/:uid` (desvincular).
- **lotes** (partidas de animales): `GET /lotes` · `POST /lotes` (nombre, fecha, idCliente,
  idCorral, color; sin color → auto de la paleta) · `GET /lotes/:id` (con animales) ·
  `PATCH /lotes/:id` · `POST /lotes/:id/animales` · `PATCH /lotes/:id/animales/:animalId`
  (incluye `estado`: sano|enfermo|muerto) · `DELETE /lotes/:id/animales/:animalId` ·
  `POST/DELETE /lotes/:id/animales/:animalId/enfermeria` (toggle de enfermería).
  Un **cliente** sólo ve sus propios lotes (`id_cliente = uid`).
- **corrales**: `GET /corrales` (estado derivado: libre|ocupado|enfermeria|inactivo) ·
  `GET /corrales/mapa` (fichas por corral para el panel de Lotes; incluye `loteId` del ocupante
  para validar drag & drop) ·   `GET /corrales/enfermerias` (picker) · `POST /corrales` ·
  `PATCH /corrales/:id` (tipo NO editable) · `PATCH /corrales/:id/activo` (toggle; bloquea
  deshabilitar ocupados/con animales). `GET /corrales` y `/corrales/enfermerias` están
  restringidos a no-clientes (`@Roles`); el cliente usa sólo `/corrales/mapa`, que se filtra
  a sus lotes (regla 8).
- **usuarios**: `POST /usuarios/bootstrap` (sin rol, pendiente) · `GET /usuarios/candidatos` ·
  `PATCH /usuarios/:uid/rol` (sys-admin asigna anfitrión/operario/cliente) ·
  `PATCH /usuarios/:uid/nombre|celular`.

## Convenciones

- Nombres de columnas en snake_case (`id_empresa`), entidades en camelCase.
- Errores vía `BadRequestException`/`ForbiddenException`/`NotFoundException` (el FE muestra `message`).
- Permisos con `@Permissions('lectura:...')` / `@Permissions('escritura:...')`; roles con `@Roles(...)`.

## Permisos de roles (Firestore)

| Rol | Permisos |
|---|---|
| `sys-admin` | todos |
| `anfitrion` | `lectura:empresa`, `escritura:empresa`, `lectura:cliente`, `escritura:cliente`, `lectura:lote`, `escritura:lote`, `lectura:corral`, `escritura:corral` |
| `operario` | `lectura:lote`, `escritura:lote`, `lectura:corral` |
| `cliente` | `lectura:lote` |

Modelo de datos, paleta y seed de Firestore: ver [`DESIGN.md`](./DESIGN.md).