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
| `anfitrion` | `lectura:empresa`, `escritura:empresa`, `lectura:cliente`, `escritura:cliente`, `lectura:lote`, `escritura:lote`, `lectura:corral`, `escritura:corral` |
| `operario` | `lectura:lote`, `escritura:lote`, `lectura:corral` |
| `cliente` | `lectura:lote` |

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
  `desbaste_fin`, `peso_neto_fin`, `diferencia`, `aum_diario`, `observaciones`. Los
  netos/diferencia/aum diario se calculan server-side (`LotesService.computar`). Además
  `estado` (`sano`|`enfermo`|`muerto`) e `id_corral_enfermeria` (nullable): sólo marca la
  excepción de enfermería; la ubicación efectiva del animal es `id_corral_enfermeria ??
  lote.id_corral` (derivada). Y `id_raza`/`id_categoria` (FKs a los catálogos, nullable).
  **El sexo ya no es columna del animal: se INFIERE de la categoría** (`categoria.sexo`).
- `pesaje` — serie temporal de pesos, la FUENTE DE VERDAD: `id`, `id_animal` FK, `fecha` DATE,
  `tipo` (`inicial`|`intermedio`|`final`), `peso` NUMERIC, `desbaste` NUMERIC (opcional, default
  0), `peso_neto` (denormalizado = peso − desbaste), timestamps. Un pesaje es SIEMPRE por
  animal: el "peso total del lote" de una fecha se obtiene SUMANDO los pesajes de esa fecha
  (aunque la UI cargue un total, el server lo reparte `total / cantidad`). `UNIQUE(id_animal,
  tipo, fecha)`. Las columnas `peso_inicial`/`peso_final`/fechas/netos/diferencia/aum_diario de
  `animal` son una PROYECCIÓN derivada del pesaje 'inicial' y el 'final', recalculada por
  `LotesService.proyectarAnimal` a cada cambio de pesaje (no se escriben directo).
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
{ "nombre": "sys-admin", "permisos": ["p_empresa_r", "p_empresa_w", "p_cliente_r", "p_cliente_w", "p_lote_r", "p_lote_w", "p_corral_r", "p_corral_w"] }
// roles/2
{ "nombre": "anfitrion", "permisos": ["p_empresa_r", "p_empresa_w", "p_cliente_r", "p_cliente_w", "p_lote_r", "p_lote_w", "p_corral_r", "p_corral_w"] }
// roles/3
{ "nombre": "operario", "permisos": ["p_lote_r", "p_lote_w", "p_corral_r"] }
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
   (peso neto, diferencia, aum. diario) se calculan en el server para mantener coherencia.
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