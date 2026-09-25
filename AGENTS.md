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
    Cada movimiento tiene **`fecha`+`hora` de negocio** (default ahora al registrar, editables;
    backfill desde `created_at`) → permiten reconstruir el estado del corral en un instante.
11. **Historial lote↔corral** (`lote_corral_asignacion`): intervalos de validez
    (`id_lote`, `id_corral`, `desde`, `hasta` NULL=vigente). Se escribe al crear lote, al
    cambiar `lote.id_corral` (`PATCH /lotes/:id`) y al liberar el corral
    (`quitarMuertosSiLoteSinVivos`). Sirve para saber **qué lotes estaban en un corral en un
    instante dado** (query por rango, sin replay). `lote.id_corral` queda como caché del vigente.

## Módulos

- **auth**: `FirebaseStrategy` (valida ID token + resuelve `idEmpresas`, `roles`, `permisos`,
  `nombre` —de Firestore, `nombre`/`nombreUsuario`— vía `getOrLoadAuth`),
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
  `POST /lotes/:id/animales/masiva` (carga masiva: raza/pelaje/categoría **opcionales**,
  cantidad + caravanas; la partida la decide el server y el peso inicial se carga en Pesajes) ·
  `POST /lotes/:id/animales/edicion-masiva` (raza/categoría/pelaje por animal del lote o de
  una partida: `{ alcance, idPartida?, valores: [{animalId, idRaza?, idCategoria?, idPelaje?}] }`
  con campo ausente = no cambia, `null` = limpia, número = setea; catálogos validados) ·
  `PATCH /lotes/:id/animales/:animalId` (incluye `estado` + `idMotivo`/`motivo` para el
  historial) · `DELETE /lotes/:id/animales/:animalId` ·
  `POST /lotes/:id/animales/:animalId/enfermeria` (motivo obligatorio → estado 'enfermo') ·
  `DELETE .../enfermeria` (body: estado 'sano'|'muerto' + causa opcional/obligatoria) ·
  `GET .../movimientos` (historial, fecha DESC). `idCliente` admite **cliente o anfitrión**
  de la empresa. Un **cliente** sólo ve sus propias partidas (`id_cliente = uid`).
- **pesajes** (parte de `lotes`; fuente de verdad de los pesos, por animal):
  `GET /lotes/:id` incluye `pesajes[]` y `partidas[]`. `POST :id/pesajes/inicial` (con
  `idPartida` = por partida), `POST :id/pesajes/intermedios` y `POST :id/pesajes/final`
  (**varios finales por fecha** por salidas/cierres parciales) comparten la lógica:
  **candidatos = vivos del alcance (lote o `idPartida`) + los que YA tienen un pesaje de ese
  tipo en el contexto** (incluidos SALIDOS, para corregir peso/fecha). En modo `animal` se
  acepta un **subconjunto** (el FE decide el alcance); en `total` reparte entre los vivos sin
  pesaje en el contexto
  ({ fecha, modo: total|animal, pesoTotal?, desbasteTotal?,
  animales?[{animalId,peso,desbaste?}] }).
  `PATCH :id/pesajes/:pesajeId` (edita peso/desbaste/fecha de un pesaje),
  `DELETE :id/pesajes/intermedios/:fecha` (borra una columna intermedia del lote),
  `DELETE :id/pesajes/final` (borra todos los finales) y `DELETE :id/pesajes/final/:fecha`
  (borra el grupo final de esa fecha). Tras
  cada cambio, `proyectarAnimal(es)` recalcula las columnas de peso de `animal`
  (inicial/final/netos y **diferencia = peso final − peso inicial, BRUTOS**); el **aum. diario
  no se persiste**: lo calcula `calcularAumDiario` en `GET /lotes/:id` usando el pesaje `final`
  si existe, si no el último por fecha. Los objetivos de pesaje incluyen vivos
  (`sano`/`enfermo`) **y** los que ya tienen un pesaje de ese tipo/contexto (aunque estén
  `salido`), para poder corregirlos; los muertos nunca. Ver decisión 8 de DESIGN.
- **partidas** (parte de `lotes`; tandas de ingreso): tabla `partida` (id_lote, fecha de carga)
  + `animal.id_partida`. El nombre ("Partida N") se deriva por orden de fecha/id. Al dar de alta
  animales, `resolverPartidaAlta(idLote)` (la decisión es **sólo del server**, sin parámetros del
  cliente): si hay una partida **ABIERTA** (algún vivo sin peso inicial) se une a ella; si no
  (todas pesadas o ninguna) crea una nueva hoy. El peso inicial **nunca** se carga en el alta
  (va en Pesajes). `removeAnimal` limpia partidas vacías. Ver decisión 9 de DESIGN.
- **corrales**: `GET /corrales` (estado derivado: libre|ocupado|enfermeria|inactivo; comunes
  con `lotesOcupantes[]`, pueden compartirse; incluye `tieneVivos` = hay animales con estado
  sano/enfermo, para filtrar "alimentables" en el modal) ·
  `GET /corrales/mapa` (fichas por corral para el panel de Lotes; incluye `loteIds[]` de los
  lotes del común para validar drag & drop; requiere `lectura:lote`, no `lectura:corral`) ·
  `GET /corrales/enfermerias` (picker) · `POST /corrales` ·
  `PATCH /corrales/:id` (tipo NO editable; el `nombre` se normaliza con `capitalizarNombre`,
  regla 9) · `PATCH /corrales/:id/activo` (toggle; bloquea
  deshabilitar comunes con lotes activos / enfermerías con animales). `GET /corrales` y
  `/corrales/enfermerias` están
  restringidos a no-clientes (`@Roles`); el cliente usa sólo `/corrales/mapa`, que se filtra
  a sus lotes y animales (regla 8), con enfermería siempre visible. Los corrales se ordenan por
  **nombre natural** (alfabético; numérico si tienen números: "Corral 2" < "Corral 10"),
  preservando el agrupamiento por tipo.
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
- **dietas** (módulo de alimentación): `GET /dietas?estado=activas|todas` (`lectura:dieta`;
  `todas` requiere `escritura:dieta`) devuelve cada dieta con su versión vigente e
  insumos (incluye las GLOBALES, `id_empresa` NULL) · `POST /dietas` (`escritura:dieta`)
  crea dieta o NUEVA versión si ya existe el nombre en el mismo alcance (versiona: desactiva la
  anterior). El **sys-admin** puede crear para Global (`idEmpresa: null`) o una empresa
  (`idEmpresa: n`); el resto sólo para la suya. `GET /dietas/:id/versiones` (histórico) y
  `PATCH /dietas/:id/activo` (activa/desactiva la dieta ENTERA) — las dietas globales sólo las
  gestiona el sys-admin. La dieta se compone de **insumos** (`dieta_version_insumo`):
  cada item es un `idInsumo` existente (con categoría "Ingrediente dieta", global o de la
  empresa; para dieta global sólo insumos globales) o un `nombre` nuevo que el server crea
  como insumo con esa categoría y el alcance de la dieta ("crear vía dieta", sin exigir
  escritura:insumo). La suma de % debe ser 100 (server). Ver decisión 10 de DESIGN.
- **alimentacion** (alimentar corrales + histórico): `POST /alimentaciones` (`escritura:alimento`)
  con `{ idCorral, idDieta, cantidadKg, fecha, hora? }` (una fila) y
  `POST /alimentaciones/masiva` con `{ idCorral, filas: [{ idDieta, cantidadKg, fecha, hora? }] }`
  (varias filas, mismo corral, en una transacción) — sólo corrales COMUNES (las enfermerías se
  alimentan a través del corral de su lote). Cada fila tiene **instante T = fecha + hora**
  (default 12:00). La `cantidadKg` es la del CORRAL y se reparte por fila. **Los animales del
  corral se RECONSTRUYEN al instante T** (`estadoCorralEn`): lotes del corral en T vía
  `lote_corral_asignacion` (query de intervalos) y, por animal, vivo en T (existía, no salió ni
  murió antes de T) y en común o en enfermería según el último `animal_movimiento` ≤ T. Tasa =
  cantidad / vivos en el común (común); los del lote en ENFERMERÍA suman una ESTIMACIÓN extra a
  la misma tasa. Guarda snapshot: `cantidad_corral_kg` + `cantidad_enfermeria_kg` =
  `cantidad_kg`; `n_animales`/`n_animales_enfermeria` y el desglose por lote en `alimentacion_lote`.
  `GET /alimentaciones` (`lectura:alimento`) lista el histórico con filtros
  `idCorral`/`idLote`/`idCliente`/`fechaDesde`/`fechaHasta`. `PATCH /alimentaciones/:id`
  (`escritura:alimento`) edita `fecha`+`hora` (y opcionalmente `idDieta`, `cantidadKg`,
  `ajuste`) y **recalcula** el reparto al nuevo instante. `GET /alimentaciones/estado-corral?idCorral&fecha&hora` (`escritura:alimento`) devuelve la
  reconstrucción (por lote: común/enfermería) para precargar el modal. El alta acepta un
  `ajuste: [{loteId, nAnimales, nAnimalesEnfermeria}]` opcional por fila que **reemplaza** la
  reconstrucción (override editable del usuario). Base del reporte de costo. Ver DESIGN.
- **salidas** (egreso/entrega de animales + histórico): `POST /lotes/:id/salidas`
  (`escritura:salida`) con `{ fecha, hora?, tipo: 'lote'|'partida'|'animales', idPartida?, animales:
  [{animalId, pesoFinal?, desbaste?}] }` (hora default 12:00). Salen animales VIVOS (sano/enfermo);
  'lote'/'partida' exigen el grupo completo. El grupo debe tener pesaje FINAL (se crea con la fecha
  de la salida si falta; el item exige `pesoFinal`). Crea `salida` + `salida_animal` (snapshot de
  pesos y diferencia) y congela `salida.id_corral` desde `lote.id_corral` antes de liberar el corral;
  pasa el estado a **'salido'** y, si el lote queda sin vivos, libera el corral (limpia
  `lote.id_corral` y las enfermerías de sus animales — "se quitan los muertos del corral").
  `GET /salidas` (`lectura:salida`) lista el histórico con filtros
  `idLote`/`idPartida`/`idCliente`/`fechaDesde`/`fechaHasta` y desglose por animal
  (inicial → final + diferencia; conteo y totales se recalculan desde las filas reales).
  `PATCH /salidas/:id` (`escritura:salida`) edita `fecha`+`hora`. Aplica la migración
  `016-salida-corral-snapshot.sql`; las salidas previas quedan con `id_corral` NULL hasta
  completarlas. Ver el modelo en DESIGN.
- **insumos** (catálogo de insumos + categorías): `GET /insumos?estado=activas|todas&scope=todas|global|empresa&idEmpresa=`
  (`lectura:insumo`; `todas` requiere `escritura:insumo`; `idEmpresa` sólo sys-admin) con su
  categoría · `GET /insumos/categorias` (globales + empresa) · `POST /insumos`
  (`escritura:insumo`): el sys-admin elige el alcance (`idEmpresa` null = GLOBAL), el resto
  crea para su empresa; la categoría puede ser existente (`idCategoria`, global o de la
  empresa destino) o nueva (`categoriaNueva`: se busca o se crea con el alcance del insumo,
  mismo mecanismo que los insumos nuevos al guardar una dieta) · `PATCH /insumos/:id` (los globales sólo los
  gestiona el sys-admin; sólo él cambia el alcance) · `PATCH /insumos/:id/activo`
  (activa/desactiva el insumo entero). Nombre único por alcance (case-insensitive,
  `capitalizarNombre`, regla 9). Migración `017-insumos.sql`. Ver el modelo en DESIGN.

## Convenciones

- Nombres de columnas en snake_case (`id_empresa`), entidades en camelCase.
- Errores vía `BadRequestException`/`ForbiddenException`/`NotFoundException` (el FE muestra `message`).
- Permisos con `@Permissions('lectura:...')` / `@Permissions('escritura:...')`; roles con `@Roles(...)`.

## Permisos de roles (Firestore)

| Rol | Permisos |
|---|---|
| `sys-admin` | todos |
| `anfitrion` | `lectura:empresa`, `escritura:empresa`, `lectura:cliente`, `escritura:cliente`, `lectura:lote`, `escritura:lote`, `lectura:corral`, `escritura:corral`, `lectura:dieta`, `escritura:dieta`, `lectura:alimento`, `escritura:alimento`, `lectura:salida`, `escritura:salida`, `lectura:insumo`, `escritura:insumo` |
| `operario` | `lectura:lote`, `escritura:lote`, `lectura:corral`, `lectura:dieta`, `escritura:dieta`, `lectura:alimento`, `escritura:alimento`, `lectura:salida`, `escritura:salida`, `lectura:insumo`, `escritura:insumo` |
| `cliente` | `lectura:lote` (ve sus lotes y, en el mapa de Lotes, los corrales con animales de sus lotes; enfermería siempre) |

`lectura:dieta` ve sólo dietas activas; `escritura:dieta` ve todas las versiones,
crea/versiona y activa/desactiva dietas enteras. `lectura:alimento` ve el histórico de
alimentación; `escritura:alimento` registra alimentaciones. `lectura:salida` ve el histórico de
salidas; `escritura:salida` da salida a animales. `lectura:insumo` ve el catálogo de
insumos (sólo activos); `escritura:insumo` ve también los desactivados, crea/edita y
activa/desactiva.

**Seed de Firestore pendiente**: agregar los permisos `p_salida_r` / `p_salida_w` y
`p_insumo_r` / `p_insumo_w` a los roles 1, 2 y 3 (además de los ya documentados
`p_dieta_r/w` y `p_alimento_r/w`).

Modelo de datos, paleta y seed de Firestore: ver [`DESIGN.md`](./DESIGN.md).