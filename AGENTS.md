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
7. **Ubicación derivada (corrales)**: un corral COMÚN puede alojar VARIOS lotes activos →
   estado libre/ocupado se DERIVA de `lote.id_corral` (no se almacena; ocupado = existe al
   menos un lote activo). La ubicación de un animal es
   `animal.id_corral_enfermeria ?? lote.id_corral`: el campo del animal sólo marca la EXCEPCIÓN
   de enfermería, y al "traer" se limpia (vuelve al corral ACTUAL del lote automáticamente).
   Validaciones en `LotesService.validarCorralComun` (común/activo/empresa; ya NO exige que
   esté libre) y `CorralesService.toggleActivo` (bloquea deshabilitar si tiene lotes activos).
   `enviarEnfermeria` acepta reasignación entre enfermerías vía `idCorral` (drag & drop del mapa).
   El mapa expone `loteIds: number[]` (todos los lotes del común) y la UI valida el drop de
   "traer" con `loteIds.includes(loteIdAnimal)`.
8. **Aislamiento del cliente**: en `LotesService`, los usuarios con rol cliente sólo ven/acceden
   a lotes con `id_cliente = uid` (en `findAll` y `getLoteVerificado`). En `CorralesService.mapa`,
   un cliente sólo ve los corrales de SUS lotes y en las enfermerías únicamente animales de sus
   lotes (la vista `/corrales` completa y `/corrales/enfermerias` están bloqueadas por `@Roles`).
   Mantener esto al ampliar.
 9. **Catálogos multitenant** (`raza`, `categoria`, `pelaje`, `proveedor`, `lugar_origen`,
    `motivo`):
    `id_empresa` NULL = valor GLOBAL (seed de la migración 004: razas y categorías por defecto);
    con valor = creado desde los formularios de esa empresa. Unicidad por
    (COALESCE(id_empresa,0), LOWER(nombre)). El módulo **catalogos** resuelve lectura
    (globales + empresa actual, `lectura:lote`), alta desde formularios (`escritura:lote`,
    asociada a la empresa, idempotente en lowercase) y las vistas admin de sys-admin
    (`/catalogos/:tipo/admin`). Un lote puede asociarse a un **cliente o al anfitrión** de la
    empresa (`GET /clientes/titulares`; `validarTitularDeEmpresa` en `LotesService`).
    **Normalize**: los `nombre` de catálogos Y corrales se guardan con `capitalizarNombre`
    (`src/utils/nombres.util.ts`: primera letra del nombre en mayúscula, resto en minúscula;
    migración 006 para el histórico) y las listas salen **ordenadas alfabético asc
    case-insensitive** (`ORDER BY LOWER(nombre)`).
    **Sexo del animal**: ya no es columna; se infiere de `categoria.sexo`
    ('MACHO'|'HEMBRA'|NULL). Al crear una categoría desde el autocomplete se puede setear el
    sexo (`POST /catalogos/categoria { nombre, sexo }`). **Pelaje↔Raza**: relación N:N vía
    `raza_pelaje` (`Pelaje.razas` es el lado dueño); un pelaje puede ser genérico (sin raza) o
    común a varias. `GET /catalogos/pelaje` devuelve los `razas: number[]` de cada uno (para
    filtrar por raza en la UI) y `POST /catalogos/pelaje { nombre, idRaza? }` crea/asocia.
10. **Movimientos sanitarios** (`animal_movimiento`): historial de envíos a enfermería
    (`a_enfermeria`, el estado pasa a 'enfermo' y el motivo es obligatorio), altas
    (`de_enfermeria`, pide estado 'sano'|'muerto' y causa obligatoria si es muerto) y cambios
    de estado desde la grilla (`cambio_estado`, motivo obligatorio al pasar a enfermo/muerto).
    El motivo se resuelve/crea en el catálogo (`resolverMotivo`) y se guarda también como
    snapshot de texto junto a los nombres de corral (el historial no se deforma).

## Módulos

- **auth**: `FirebaseStrategy` (valida ID token + resuelve `idEmpresas`, `roles`, `permisos`),
  guards (`firebase`, `firebase-bootstrap`, `roles`, `permissions`), `GET /auth/me`.
- **cache**: `FirestoreCacheService` + `POST /cache/invalidate`.
- **empresas**: `GET /empresas` · `GET /empresas/me` · `POST /empresas` (el anfitrión crea su
  única empresa; el rol ya lo asignó sys-admin) · `PATCH /empresas/:id` (nombre/dirección/teléfono).
- **clientes**: `GET /clientes` · `GET /clientes/titulares` (clientes + anfitrión: dueños
  posibles de un lote) · `GET /clientes/operarios` · `GET /clientes/candidatos` ·
  `POST /clientes { uid, rol: 'cliente'|'operario' }` (vincular) ·
  `PATCH /clientes/:uid/rol` (promover a operario) · `DELETE /clientes/:uid` (desvincular).
- **lotes** (partidas de animales): `GET /lotes` · `POST /lotes` (nombre, fecha, idCliente,
  idProveedor, idLugarOrigen, idCorral, color; sin color → auto de la paleta) ·
  `GET /lotes/:id` (con animales, incl. raza/categoría/pelaje y `sexo` inferido) ·
  `PATCH /lotes/:id` · `POST /lotes/:id/animales` (`caravana` + `idPelaje` requeridos;
  `idRaza`/`idCategoria` opcionales; `nAnimal` auto = último del lote + 1) ·
  `POST /lotes/:id/animales/masiva` (carga masiva: raza opt + pelaje + categoría requeridos,
  cantidad + caravanas, en una transacción) ·
  `PATCH /lotes/:id/animales/:animalId` (incluye `estado` + `idMotivo`/`motivo` para el
  historial) · `DELETE /lotes/:id/animales/:animalId` ·
  `POST /lotes/:id/animales/:animalId/enfermeria` (motivo obligatorio → estado 'enfermo') ·
  `DELETE .../enfermeria` (body: estado 'sano'|'muerto' + causa opcional/obligatoria) ·
  `GET .../movimientos` (historial, fecha DESC). `idCliente` admite **cliente o anfitrión**
  de la empresa. Un **cliente** sólo ve sus propias partidas (`id_cliente = uid`).
- **corrales**: `GET /corrales` (estado derivado: libre|ocupado|enfermeria|inactivo; comunes
  con `lotesOcupantes[]`, pueden compartirse) ·
  `GET /corrales/mapa` (fichas por corral para el panel de Lotes; incluye `loteIds[]` de los
  lotes del común para validar drag & drop) ·   `GET /corrales/enfermerias` (picker) · `POST /corrales` ·
  `PATCH /corrales/:id` (tipo NO editable; el `nombre` se normaliza con `capitalizarNombre`,
  regla 9) · `PATCH /corrales/:id/activo` (toggle; bloquea
  deshabilitar comunes con lotes activos / enfermerías con animales). `GET /corrales` y
  `/corrales/enfermerias` están
  restringidos a no-clientes (`@Roles`); el cliente usa sólo `/corrales/mapa`, que se filtra
  a sus lotes (regla 8).
- **usuarios**: `POST /usuarios/bootstrap` (sin rol, pendiente) · `GET /usuarios/candidatos` ·
  `PATCH /usuarios/:uid/rol` (sys-admin asigna anfitrión/operario/cliente) ·
  `PATCH /usuarios/:uid/nombre|celular`.
- **catalogos** (raza · categoria · pelaje · proveedor · lugar_origen · motivo):
  `GET /catalogos/:tipo` (globales + mi empresa, `lectura:lote`; `pelaje` incluye `razas:
  number[]` y `categoria` su `sexo`) · `POST /catalogos/:tipo { nombre, sexo?, idRaza? }` (alta
  asociada a mi empresa, `escritura:lote`, idempotente en lowercase; `sexo` sólo en categoria,
  `idRaza` asocia el pelaje a la raza) · `GET /catalogos/:tipo/admin?scope=todas|global|empresa&idEmpresa=` y
  `POST /catalogos/:tipo/admin { nombre, idEmpresa|null, sexo? }` (sólo sys-admin; `idEmpresa` null =
  global). Ver reglas 9 y 10.

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