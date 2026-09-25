# DESIGN — Gabino Gestión de Hacienda

## Propuesta

**Gabino** · *Gestión de hacienda*. Plataforma multitenant donde cada anfitrión representa
una empresa que hospeda lotes de ganado de clientes. Desktop-first, responsive, sobrio,
profesional y dinámico.

---

## Paleta (tokens en `ui/src/index.css`)

Marrón profundo como color de marca (por las vacas), con neutros cálidos y acentos
complementarios. Tokens en OKLCH; light + dark.

| Token | Light | Dark |
|---|---|---|
| `--primary` (marrón marca) | `oklch(0.45 0.08 45)` | `oklch(0.72 0.09 60)` (caramelo) |
| `--primary-soft` (crema/tan) | `oklch(0.94 0.03 60)` | `oklch(0.3 0.04 55)` |
| `--background` | `oklch(0.985 0.005 70)` | `oklch(0.18 0.012 45)` |
| `--foreground` | `oklch(0.2 0.02 45)` | `oklch(0.95 0.006 70)` |
| `--sidebar` | `oklch(0.975 0.006 70)` | `oklch(0.15 0.012 45)` |
| `--success` (verde salvia) | `oklch(0.55 0.09 120)` | `oklch(0.7 0.1 120)` |
| `--warning` (ámbar) | `oklch(0.68 0.14 75)` | `oklch(0.78 0.13 75)` |
| `--info` (azul) | `oklch(0.55 0.13 240)` | `oklch(0.7 0.13 240)` |
| `--destructive` | `oklch(0.55 0.18 27)` | `oklch(0.62 0.2 27)` |

Neutros (`muted`, `accent`, `border`, `ring`, …) en el mismo matiz cálido (~hue 45–70).

---

## Roles y permisos

Roles en Firestore (`roles/{id}`). idRol: `1=sys-admin`, `2=anfitrion`, `3=operario`, `4=cliente`.

| Rol | Permisos |
|---|---|
| `sys-admin` | todos |
| `anfitrion` | `lectura:empresa`, `escritura:empresa`, `lectura:cliente`, `escritura:cliente`, `lectura:lote`, `escritura:lote`, `lectura:corral`, `escritura:corral`, `lectura:dieta`, `escritura:dieta`, `lectura:alimento`, `escritura:alimento`, `lectura:insumo`, `escritura:insumo` |
| `operario` | `lectura:lote`, `escritura:lote`, `lectura:corral`, `lectura:dieta`, `escritura:dieta`, `lectura:alimento`, `escritura:alimento`, `lectura:insumo`, `escritura:insumo` |
| `cliente` | `lectura:lote` (ve sus lotes y, en el mapa de Lotes, los corrales con animales de sus lotes; enfermería siempre) |

`lectura:dieta` ve sólo dietas activas + calculadora; `escritura:dieta` ve todas las
versiones, crea/versiona y activa/desactiva dietas enteras. `lectura:insumo` ve el
catálogo de insumos (sólo activos); `escritura:insumo` ve también los desactivados,
crea/edita y activa/desactiva.

Flujo de registro: un usuario se registra **sin rol** (`idRol: null`) y queda pendiente.
`sys-admin` le asigna el rol (**anfitrión**, **cliente** u **operario**) desde la sección
Usuarios (`PATCH /usuarios/:uid/rol`), o el **anfitrión** lo vincula como cliente/operario
a su empresa (`POST /clientes`). El anfitrión crea su empresa en "Mi Empresa"
(`POST /empresas`) y queda asociado a ella.

---

## Modelo de datos

### Firestore (identidad)

- `usuarios/{uid}` — `{ idRol, nombre, celular?, idEmpresa? (anfitrión/operario), idEmpresas? (array, clientes) }`
- `roles/{id}` — `{ nombre, permisos: [permisoDocId, ...] }`
- `permisos/{id}` — `{ nombre }`
- **No** hay colección de empresas en Firestore: viven en Postgres.

### Postgres (dominio y relaciones)

- `empresa` — `id SERIAL PK`, `nombre`, `direccion`, `telefono`, `activo`, `created_at`, `updated_at`.
  El anfitrión referencia su empresa con `idEmpresa` (id numérico) en su doc de Firestore.
- `empresa_cliente` — `id`, `id_empresa FK→empresa`, `id_cliente VARCHAR(128) (UID)`, `created_at`,
  `UNIQUE(id_empresa, id_cliente)`. **Fuente de verdad** de la relación muchos-a-muchos
  empresa↔cliente. Espejada en el array `idEmpresas` del cliente en Firestore para auth.
- `corral` — `id`, `id_empresa FK`, `nombre`, `tipo` (`comun`|`enfermeria`), `capacidad`
  (int, informativa), `descripcion`, `activo`, timestamps. Los comunes pueden alojar VARIOS
  lotes activos (estado libre/ocupado DERIVADO de `lote.id_corral`); las enfermerías no tienen
  estado y reciben animales de varios lotes.
- `lote` — `id`, `id_empresa FK`, `id_cliente VARCHAR(128)` (dueño: **cliente o anfitrión** de
  la empresa, opcional), `nombre`, `descripcion`, `fecha`, `id_corral FK→corral` (común que lo
  hospeda), `id_proveedor`/`id_lugar_origen` (FKs a catálogos, nullable), `color` (hex, para
  el mapa; auto-asignado de `PALETA_LOTE` al crear si no viene), `activo`, timestamps.
- `animal` — `id`, `id_lote FK`, y los campos de la planilla PESAJE ING-EGR (fila 5):
  `n_animal` (auto = último del lote + 1 si no viene), `caravana` (VARCHAR, requerida en la
  app, única por lote), `id_pelaje` (FK al catálogo `pelaje`), `fecha_pesaje_ini`,
  `peso_inicial`, `desbaste_ini`, `peso_neto_ini`, `fecha_pesaje_fin`, `peso_final`,
  `desbaste_fin`, `peso_neto_fin`, `diferencia`, `observaciones`. Los
  netos/diferencia se calculan server-side (`LotesService.computar`). El **aumento diario NO es
  columna**: se calcula al consultar `/lotes/:id` (`calcularAumDiario`: último peso − inicial ÷
  días). Además
  `estado` (`sano`|`enfermo`|`muerto`) e `id_corral_enfermeria` (nullable): sólo marca la
  excepción de enfermería; la ubicación efectiva del animal es `id_corral_enfermeria ??
  lote.id_corral` (derivada). Y `id_raza`/`id_categoria` (FKs a los catálogos, nullable).
  **El sexo ya no es columna del animal: se INFIERE de la categoría** (`categoria.sexo`).
- `pesaje` — serie temporal de pesos, la FUENTE DE VERDAD: `id`, `id_animal` FK, `fecha` DATE,
  `tipo` (`inicial`|`intermedio`|`final`), `peso` NUMERIC, `desbaste` NUMERIC (opcional, default
  0), `peso_neto` (denormalizado = peso − desbaste), timestamps. Un pesaje es SIEMPRE por
  animal: el "peso total del lote" de una fecha se obtiene SUMANDO los pesajes de esa fecha
  (aunque la UI cargue un total, el server lo reparte `total / cantidad`). `UNIQUE(id_animal,
  tipo, fecha)`. Las columnas `peso_inicial`/`peso_final`/fechas/netos/diferencia de
  `animal` son una PROYECCIÓN derivada del pesaje 'inicial' y el 'final', recalculada por
  `LotesService.proyectarAnimal` a cada cambio de pesaje (no se escriben directo). El
  `aumDiario` no se persiste: se calcula en `GET /lotes/:id`.
- `partida` — tanda de animales ingresados juntos dentro de un lote: `id`, `id_lote` FK,
  `fecha` DATE (fecha de carga), timestamps. El nombre ("Partida 1", "Partida 2", …) se DERIVA
  ordenando por fecha/id dentro del lote (no se guarda). `animal.id_partida` FK. Cada partida
  tiene su **pesaje inicial**; los **intermedios y finales son del lote** (todas las partidas
  se pesan juntas). Si un lote tiene una sola partida, la UI no muestra la división.
- **Dietas (módulo de alimentación)** — `dieta` (lógica, por `id_empresa`+`nombre`;
  `id_empresa` **NULL = dieta GLOBAL** visible/usable por todas las empresas, como los catálogos
  globales) con `activa` ON/OFF de la dieta ENTERA (manual, `escritura:dieta`) → `dieta_version`
  (composición; `version` int, `activa` = vigente; al crear una nueva se desactivan las anteriores
   → histórico, base del futuro registro de alimentación de corrales) → `dieta_version_insumo`
   (`id_insumo` FK + `porcentaje` NUMERIC, la suma de % de una versión es 100, validado en la
   app). Una dieta NO se edita: se versiona (`POST /dietas` crea versión si ya existe el nombre en
   el mismo alcance). La dieta se compone de **insumos** con categoría "Ingrediente dieta"
   (global o de la empresa; fijas globales: 1 = Ingrediente dieta, 2 = Veterinaria). El
   **sys-admin crea/versiona
   para Global o para una empresa** (`idEmpresa` null/número); el resto (`escritura:dieta`) sólo
para su empresa. Las dietas globales sólo las gestiona el sys-admin. `lectura:dieta` ve
   globales + activas de su empresa; la calculadora de raciones es sólo de la UI.
- **Alimentación de corrales** — `alimentacion` (evento: corral + dieta + versión + fecha +
  cantidad total + tasa por animal + totales) → `alimentacion_lote` (reparto por lote con
  snapshot `id_cliente` del titular para filtrar el histórico). Se alimentan **corrales
  comunes** (las enfermerías se alimentan a través del corral de su lote). La cantidad
  ingresada es la del CORRAL: `cantidad_por_animal = cantidad / animales VIVOS presentes del
  corral` (`estado IN ('sano','enfermo')` y `id_corral_enfermeria NULL`); cada lote recibe
  `tasa × nAnimales`. Los animales del lote que están en **enfermería** reciben una ESTIMACIÓN
  **extra** a la misma tasa (porque allí se alimenta junto a animales de otros corrales/lotes):
  se SUMAN al total, no se reparten del corral. Queda desglosado: `cantidad_corral_kg`
  (ingresada) + `cantidad_enfermeria_kg` = `cantidad_kg`; `n_animales` + `n_animales_enfermeria`;
  y por lote en `alimentacion_lote` (`n_animales`, `cantidad_kg`, `n_animales_enfermeria`,
  `cantidad_enfermeria_kg`). Permisos `lectura:alimento` / `escritura:alimento`. Base del
  reporte de costo.
- **Salidas de animales** — `salida` (evento: lote + corral al momento de la salida + fecha +
  tipo 'lote'|'partida'|'animales' + n + totales) → `salida_animal` (snapshot por animal:
  `peso_inicial`, `peso_final`, `diferencia_kg`). Salen animales **vivos** (`estado IN
  ('sano','enfermo')`; muertos y salidos no). El grupo debe tener **pesaje final** (se crea con
  la fecha de la salida si falta) y, al salir, el animal pasa a estado **'salido'** (deja de
  considerarse: no cuenta como vivo para alimentación, pesajes, promedios ni el mapa de
  corrales). `salida.id_corral` se congela antes de liberar el corral del lote, para que el
  histórico no dependa de `lote.id_corral` posterior. `diferencia_kg` del grupo = Σ (peso final
  − peso inicial, BRUTOS). Si al salir el lote queda sin vivos, se **liberan los muertos del
  corral**: `lote.id_corral = NULL` y se limpian las enfermerías de sus animales. El pesaje FINAL
  del lote lista los ya salidos al final con su peso registrado (sólo lectura); los objetivos de
  pesaje (inicial/intermedio/final) excluyen muertos y salidos. Permisos `lectura:salida` /
  `escritura:salida`. Histórico en `GET /salidas` (filtros por lote/partida/ cliente/fechas).
- `categoria_insumo` + `insumo` — catálogo de insumos: `id`, `id_empresa` FK **nullable**
  (NULL = **global**; con valor = de esa empresa), `nombre` (único por alcance,
  case-insensitive), `descripcion` (sólo insumo, opcional), `precio_referencia` (NUMERIC,
  número sin moneda), `unidad` (`kg`|`unidad`), `id_categoria` FK (nullable), `activo`,
  timestamps. Las categorías se crean inline desde el modal de insumo: si el nombre tipeado
  no existe, el server la busca o la crea con el alcance del insumo (mismo mecanismo que los
  insumos nuevos al guardar una dieta). Permisos `lectura:insumo` / `escritura:insumo`. `GET /insumos`
  (`estado=activas|todas`, `scope=todas|global|empresa`, `idEmpresa` sólo sys-admin);
  `GET /insumos/categorias`; `POST /insumos`; `PATCH /insumos/:id` (los globales sólo los
  gestiona el sys-admin); `PATCH /insumos/:id/activo`. Migración `017-insumos.sql`.
- **Catálogos multitenant** (`raza`, `categoria`, `pelaje`, `proveedor`, `lugar_origen`,
  `motivo`) — `id`, `id_empresa` FK **nullable** (NULL = valor **global**, visible para todas;
  con valor = creado por/para esa empresa), `nombre`, timestamps. Unicidad por
  `(COALESCE(id_empresa,0), LOWER(nombre))`. Seed global (migración 004): razas Braford,
  Brangus, Hereford, Aberdeen-Angus, Cruza europea; categorías Ternero/a, Novillo/Vaquillona,
  Toro/Vaca, MEJ. Los autocomplete de la UI leen globales+empresa (`lectura:lote`) y, si no
  coincide, agregan asociado a la empresa (`escritura:lote`). Sys-admin tiene vistas de
  Razas/Categorías (`/catalogos/:tipo/admin`).
  - `categoria.sexo` (`MACHO`|`HEMBRA`|NULL=indistinto): al elegir categoría, la UI muestra el
    sexo inferido. Al crear una categoría nueva el autocomplete ofrece elegir el sexo.
  - `pelaje` + `raza_pelaje` (N:N): un pelaje puede ser **genérico** (sin raza) o común a 1 o N
    razas. Al elegir raza, la UI filtra los pelajes de esa raza (+ genéricos) y, si al crear un
    pelaje hay raza seleccionada, se asocia; si no, queda genérico.
- `animal_movimiento` — historial sanitario: `id`, `id_animal` FK, `tipo`
  (`a_enfermeria`|`de_enfermeria`|`cambio_estado`), `estado_antes`/`estado_despues`,
  `corral_origen`/`corral_destino` (snapshot de nombre), `id_motivo` FK + `motivo` (snapshot de
  texto), `id_usuario` (UID), `created_at`. Se registra en los movimientos de enfermería y en
  los cambios de estado (motivo obligatorio al pasar a enfermo/muerto).

Migraciones en `migrations/` (aplicar a mano, `synchronize: false`).

---

## Seed de Firestore (crear a mano en la consola)

```jsonc
// roles/1
{ "nombre": "sys-admin", "permisos": ["p_empresa_r", "p_empresa_w", "p_cliente_r", "p_cliente_w", "p_lote_r", "p_lote_w", "p_corral_r", "p_corral_w", "p_dieta_r", "p_dieta_w", "p_alimento_r", "p_alimento_w", "p_insumo_r", "p_insumo_w"] }
// roles/2
{ "nombre": "anfitrion", "permisos": ["p_empresa_r", "p_empresa_w", "p_cliente_r", "p_cliente_w", "p_lote_r", "p_lote_w", "p_corral_r", "p_corral_w", "p_dieta_r", "p_dieta_w", "p_alimento_r", "p_alimento_w", "p_insumo_r", "p_insumo_w"] }
// roles/3
{ "nombre": "operario", "permisos": ["p_lote_r", "p_lote_w", "p_corral_r", "p_dieta_r", "p_dieta_w", "p_alimento_r", "p_alimento_w", "p_insumo_r", "p_insumo_w"] }
// roles/4
{ "nombre": "cliente", "permisos": ["p_lote_r"] }

// permisos/p_empresa_r  { "nombre": "lectura:empresa" }
// permisos/p_empresa_w  { "nombre": "escritura:empresa" }
// permisos/p_cliente_r  { "nombre": "lectura:cliente" }
// permisos/p_cliente_w  { "nombre": "escritura:cliente" }
// permisos/p_lote_r     { "nombre": "lectura:lote" }
// permisos/p_lote_w     { "nombre": "escritura:lote" }
// permisos/p_corral_r   { "nombre": "lectura:corral" }
// permisos/p_corral_w   { "nombre": "escritura:corral" }
// permisos/p_dieta_r    { "nombre": "lectura:dieta" }
// permisos/p_dieta_w    { "nombre": "escritura:dieta" }
// permisos/p_alimento_r { "nombre": "lectura:alimento" }
// permisos/p_alimento_w { "nombre": "escritura:alimento" }
// permisos/p_insumo_r   { "nombre": "lectura:insumo" }
// permisos/p_insumo_w   { "nombre": "escritura:insumo" }

// usuarios/{uid}  — el bootstrap del BE (POST /usuarios/bootstrap, Admin SDK) lo crea con
//                  { idRol: null, nombre } (sin rol, pendiente); el FE nunca escribe directo
//                  — sys-admin asigna rol con PATCH /usuarios/:uid/rol (idRol 2|3|4, Admin SDK)
```

---

## Decisiones clave

1. **Empresa en Postgres, idEmpresa en Firestore**: la empresa es dato de dominio (Postgres).
   El anfitrión/operario la referencia con `idEmpresa` singular en Firestore; los datos de la
   empresa (nombre/dirección/teléfono) se editan en la app (`PATCH /empresas/:id`).
2. **Relación empresa↔cliente en la BD con espejo en Firestore**: `empresa_cliente` da SQL
   limpio y FK; el array `idEmpresas` del cliente permite resolver auth sin tocar la BD por
   request. Los mutadores sincronizan ambos e invalidan caché.
3. **Un anfitrión = una empresa**: sys-admin le asigna el rol anfitrión y el anfitrión crea
   su empresa (se setea `idEmpresa`). No puede tener dos empresas (se valida en `POST /empresas`).
4. **Cliente multi-empresa**: un cliente puede estar en varias empresas (tabla relacional +
   array `idEmpresas`). Cada anfitrión ve sólo sus clientes.
5. **Roles `anfitrion`/`operario`/`cliente`** reemplazan asesor/productor del proyecto base.
   sys-admin conserva la capacidad de elegir empresa puntual vía header `x-empresa-id`.
   El anfitrión vincula **clientes y operarios** a su empresa desde `/clientes` (rol al vincular).
 6. **Lotes como partidas de animales**: cada lote (`id_empresa` + dueño opcional) agrupa
    `animal`es. La entidad animal replica la planilla PESAJE ING-EGR; los campos derivados
    (peso neto, diferencia) se calculan en el server y el aum. diario al consultar el lote.
   Permisos: `lectura:lote` / `escritura:lote` (anfitrión y operario escriben; cliente lee
   sólo SUS lotes: `id_cliente = uid`).
7. **Modelo de corrales derivado**: la ocupación del corral común es `lote.id_corral`
   (VARIOS lotes activos pueden compartir un mismo común → libre/ocupado se calcula, no se
   almacena; ocupado = existe al menos un lote activo). La enfermería
   es la única excepción por animal (`animal.id_corral_enfermeria`, nullable): al "traer" se
   limpia y el animal vuelve al corral ACTUAL de su lote por derivación — sin duplicar el
   corral en cada animal ni sincronizar cambios de lote. El toggle de enfermería manda al
   primer corral `enfermeria` activo (la UI ofrece picker si hay varios). La capacidad del
    corral es informativa (no bloquea). En el mapa de drag & drop, un común expone `loteIds[]`
    y "traer" es válido al soltar en un común que contenga el lote del animal.
8. **Pesajes como serie por animal**: la tabla `pesaje` es la fuente de verdad de los pesos
   (inicial + N intermedios + final), siempre POR ANIMAL. El total del lote se deriva sumando
   por fecha; la UI puede cargar por total y el server reparte. Las columnas de peso en `animal`
   quedan como proyección recalculada (`proyectarAnimal`) para no romper la planilla PESAJE
   ING-EGR ni la lista de animales. Endpoints en `LotesController`: `POST :id/pesajes/inicial`,
   `POST :id/pesajes/intermedios`, `PATCH :id/pesajes/:pesajeId`,
    `DELETE :id/pesajes/intermedios/:fecha`, `DELETE :id/pesajes/:pesajeId`. `GET /lotes/:id`
    incluye `pesajes[]` (para columnas intermedias y la gráfica de evolución).
9. **Partidas (tandas de ingreso)**: un lote se carga por tandas; cada `partida` tiene su fecha
   de carga y su **pesaje inicial**. Los **intermedios/finales son del lote** (todas las partidas
   se pesan juntas, se exige el peso de todos los animales). `resolverPartidaAlta` al dar de alta
   animales: con `nuevaPartida` crea una hoy (sin pesar); con `idPartida` une a una existente y,
   si esa partida ya tiene inicial, EXIGE el peso de los nuevos (a esa fecha) para no distorsionar
   la gráfica; sin elección reutiliza la partida sin pesar o crea una. Con una sola partida la UI
    oculta la división. El backfill (migración 008) agrupa por `COALESCE(fecha_pesaje_ini,
    created_at)`. `GET /lotes/:id` incluye `partidas[]` (nombre derivado, nAnimales, tieneInicial).
10. **Dietas (alimentación)**: dieta lógica (`id_empresa`+`nombre`) con `activa` ON/OFF de la
    dieta entera (manual, `escritura:dieta`) y versiones (`dieta_version`, la vigente `activa`,
    las anteriores histórico). No se edita: `POST /dietas` crea dieta o nueva versión (misma
    empresa+nombre → nueva `version`, desactiva las previas). `dieta_version_insumo` guarda
    `porcentaje` y la app/server exige suma = 100. La dieta se compone de insumos con
    categoría "Ingrediente dieta". `lectura:dieta`
    ve sólo activas + calculadora; `escritura:dieta` ve todas las versiones y gestiona. Base para
    el futuro histórico de alimentación de corrales.