-- Gabino Gestión de Hacienda — Catálogos + movimientos de animales
--
-- Catálogos multitenant (`raza`, `categoria`, `proveedor`, `lugar_origen`,
-- `motivo`): `id_empresa` NULL = valor GLOBAL (visible para todas las
-- empresas, p.ej. las razas por defecto); con valor = valor agregado por/para
-- esa empresa. Unicidad por (empresa, nombre en minúsculas): cada empresa
-- puede tener su propio registro con el mismo nombre, pero no duplicado.
--
-- `animal_movimiento`: historial de movimientos sanitarios del animal
-- (envíos/egresos de enfermería y cambios de estado) con el motivo/causa.
-- Los nombres de corral se guardan como snapshot para que el historial no
-- se deforme si el corral se renombra o elimina.
--
-- Aplicar a mano (synchronize: false en TypeORM).

-- ============================================================================
-- Catálogos
-- ============================================================================

CREATE TABLE IF NOT EXISTS "raza" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "categoria" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "proveedor" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "lugar_origen" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "motivo" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

-- Unicidad: (empresa o global, nombre en lowercase)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_raza_empresa_nombre"
    ON "raza" (COALESCE("id_empresa", 0), LOWER("nombre"));
CREATE UNIQUE INDEX IF NOT EXISTS "uq_categoria_empresa_nombre"
    ON "categoria" (COALESCE("id_empresa", 0), LOWER("nombre"));
CREATE UNIQUE INDEX IF NOT EXISTS "uq_proveedor_empresa_nombre"
    ON "proveedor" (COALESCE("id_empresa", 0), LOWER("nombre"));
CREATE UNIQUE INDEX IF NOT EXISTS "uq_lugar_origen_empresa_nombre"
    ON "lugar_origen" (COALESCE("id_empresa", 0), LOWER("nombre"));
CREATE UNIQUE INDEX IF NOT EXISTS "uq_motivo_empresa_nombre"
    ON "motivo" (COALESCE("id_empresa", 0), LOWER("nombre"));

CREATE INDEX IF NOT EXISTS "idx_raza_empresa" ON "raza" ("id_empresa");
CREATE INDEX IF NOT EXISTS "idx_categoria_empresa" ON "categoria" ("id_empresa");
CREATE INDEX IF NOT EXISTS "idx_proveedor_empresa" ON "proveedor" ("id_empresa");
CREATE INDEX IF NOT EXISTS "idx_lugar_origen_empresa" ON "lugar_origen" ("id_empresa");
CREATE INDEX IF NOT EXISTS "idx_motivo_empresa" ON "motivo" ("id_empresa");

-- Seed de valores GLOBALES (id_empresa NULL → visibles para todas las empresas).
-- Idempotente: no inserta si ya existe el valor global (case-insensitive).
INSERT INTO "raza" ("nombre")
SELECT v FROM (VALUES
    ('Braford'), ('Brangus'), ('Hereford'), ('Aberdeen-Angus'), ('Cruza europea')
) AS t(v)
WHERE NOT EXISTS (
    SELECT 1 FROM "raza" r WHERE r."id_empresa" IS NULL AND LOWER(r."nombre") = LOWER(t.v)
);

INSERT INTO "categoria" ("nombre")
SELECT v FROM (VALUES
    ('Ternero/a'), ('Novillo/Vaquillona'), ('Toro/Vaca'), ('MEJ')
) AS t(v)
WHERE NOT EXISTS (
    SELECT 1 FROM "categoria" c WHERE c."id_empresa" IS NULL AND LOWER(c."nombre") = LOWER(t.v)
);

-- ============================================================================
-- Animal: raza + categoría
-- ============================================================================

ALTER TABLE "animal"
    ADD COLUMN IF NOT EXISTS "id_raza" INTEGER REFERENCES "raza"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "id_categoria" INTEGER REFERENCES "categoria"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_animal_raza" ON "animal" ("id_raza");
CREATE INDEX IF NOT EXISTS "idx_animal_categoria" ON "animal" ("id_categoria");

-- ============================================================================
-- Lote: proveedor + lugar de origen + titular (dueño)
-- ============================================================================
-- `id_cliente` pasa a admitir UIDs de clientes O del anfitrión de la empresa
-- (un anfitrión puede tener animales propios). No hay FK: la identidad vive
-- en Firestore; sólo cambia la validación en el server.

ALTER TABLE "lote"
    ADD COLUMN IF NOT EXISTS "id_proveedor" INTEGER REFERENCES "proveedor"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "id_lugar_origen" INTEGER REFERENCES "lugar_origen"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_lote_proveedor" ON "lote" ("id_proveedor");
CREATE INDEX IF NOT EXISTS "idx_lote_lugar_origen" ON "lote" ("id_lugar_origen");

-- ============================================================================
-- Movimientos sanitarios del animal (historial)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "animal_movimiento" (
    "id" SERIAL PRIMARY KEY,
    "id_animal" INTEGER NOT NULL REFERENCES "animal"("id") ON DELETE CASCADE,
    -- 'a_enfermeria' | 'de_enfermeria' | 'cambio_estado'
    "tipo" VARCHAR(30) NOT NULL,
    "estado_antes" VARCHAR(10),
    "estado_despues" VARCHAR(10),
    -- Snapshot de los corrales involucrados (nombres al momento del movimiento)
    "corral_origen" VARCHAR(100),
    "corral_destino" VARCHAR(100),
    -- Motivo/causa: FK al catálogo + snapshot del texto
    "id_motivo" INTEGER REFERENCES "motivo"("id") ON DELETE SET NULL,
    "motivo" VARCHAR(150),
    -- UID (Firestore) del usuario que ejecutó el movimiento
    "id_usuario" VARCHAR(128),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "chk_animal_movimiento_tipo"
        CHECK ("tipo" IN ('a_enfermeria', 'de_enfermeria', 'cambio_estado'))
);

CREATE INDEX IF NOT EXISTS "idx_animal_movimiento_animal"
    ON "animal_movimiento" ("id_animal", "created_at" DESC);
