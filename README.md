# Gabino Gestión de Hacienda API

Backend **NestJS + TypeORM + PostgreSQL**, autenticación con **Firebase Auth**.

## Comandos

```bash
pnpm install          # instalar dependencias
pnpm run start:dev    # desarrollo (watch) → http://localhost:3055/api
pnpm build            # nest build (tsc)
pnpm run lint         # eslint + prettier (--fix)
pnpm test             # jest
```

## Variables de entorno (`.env`)

- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` — conexión PostgreSQL.
- `PORT` — puerto (default `3055`).
- `CACHE_AUTH_TTL`, `CACHE_USUARIOS_TTL` — TTL del cache de Firestore en milisegundos (default 4h).
- `firebase-service-account.json` — credenciales del service account en la raíz del proyecto.

## Base de datos y migraciones

`TypeORM` corre con `synchronize: false`: los cambios de esquema se aplican con
archivos SQL manuales en `migrations/` (numerados, ej. `001-initial-schema.sql`).
Cada migración nueva debe ejecutarse a mano contra la BD (psql u otro cliente).
Las entidades nuevas también deben registrarse en `src/app.module.ts`.

## Autenticación y Firestore

- `FirebaseStrategy` (`src/auth/strategies/firebase.strategy.ts`) valida el ID token por request y
  resuelve `idEmpresas`, `roles` y `permisos` desde Firestore (`usuarios`, `roles`, `permisos`).
- **`FirestoreCacheService`** (`src/cache/firestore-cache.service.ts`) cachea en memoria:
  - auth por UID (`getOrLoadAuth`) — siempre incluye permisos reales;
  - el listado de usuarios (`getOrLoadUsuarios`).
- `POST /cache/invalidate` limpia todos los caches (sólo sys-admin).
- Las empresas de un usuario se resuelven de forma tolerante: un **anfitrión/operario**
  guarda su empresa en `idEmpresa` (singular); un **cliente** lleva el array `idEmpresas`
  (espejo denormalizado de la tabla `empresa_cliente`).

## Multitenancy

- Un **anfitrión** representa a una empresa que hospeda lotes de ganado de clientes.
  Al crear su empresa (`POST /empresas`) se auto-eleva a `anfitrion` y queda con esa
  única empresa (`idEmpresa` en Firestore). Los datos de la empresa (nombre, dirección,
  teléfono) se editan con `PATCH /empresas/:id`.
- La relación **empresa ↔ cliente** vive en la tabla `empresa_cliente` (fuente de verdad)
  y se administra desde `src/clientes` (vincular / desvincular / promover a operario).
  Un cliente puede pertenecer a varias empresas.

## Convenciones

- Nombres de columnas en snake_case (`id_empresa`), entidades en camelCase.
- Errores vía `BadRequestException`/`ForbiddenException`/`NotFoundException` (el FE muestra `message`).
- Permisos con `@Permissions('lectura:...')` / `@Permissions('escritura:...')`.