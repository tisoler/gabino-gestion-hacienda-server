-- Gabino Gestión de Hacienda — Módulo de alimentación: dietas e ingredientes
--
-- `ingrediente`: catálogo multitenant (igual que raza/pelaje/...), id_empresa
-- NULL = global.
-- `dieta`: dieta lógica de una empresa, identificada por (id_empresa, nombre).
--   `activa` = ON/OFF de la dieta ENTERA (manual, con escritura:dieta).
-- `dieta_version`: cada composición (versión). La vigente tiene `activa=true`;
--   al crear una nueva se desactivan las anteriores (histórico). Una dieta no se
--   edita: se versiona. Esto habilita el futuro histórico de alimentación de
--   corrales.
-- `dieta_version_ingrediente`: ingrediente + proporción (%). La suma de los %
--   de una versión es 100 (validado en la app).
--
-- Aplicar a mano (synchronize: false en TypeORM).

-- ============================================================================
-- Ingrediente (catálogo)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ingrediente" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ingrediente_empresa_nombre"
    ON "ingrediente" (COALESCE("id_empresa", 0), LOWER("nombre"));
CREATE INDEX IF NOT EXISTS "idx_ingrediente_empresa" ON "ingrediente" ("id_empresa");

-- ============================================================================
-- Dieta + versiones + ingredientes
-- ============================================================================

CREATE TABLE IF NOT EXISTS "dieta" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER NOT NULL REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(100) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

-- Una dieta (lógica) por empresa y nombre (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_dieta_empresa_nombre"
    ON "dieta" ("id_empresa", LOWER("nombre"));
CREATE INDEX IF NOT EXISTS "idx_dieta_empresa_activa" ON "dieta" ("id_empresa", "activa");

CREATE TABLE IF NOT EXISTS "dieta_version" (
    "id" SERIAL PRIMARY KEY,
    "id_dieta" INTEGER NOT NULL REFERENCES "dieta"("id") ON DELETE CASCADE,
    "version" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "uq_dieta_version" UNIQUE ("id_dieta", "version")
);

CREATE INDEX IF NOT EXISTS "idx_dieta_version_dieta" ON "dieta_version" ("id_dieta", "activa");

CREATE TABLE IF NOT EXISTS "dieta_version_ingrediente" (
    "id" SERIAL PRIMARY KEY,
    "id_dieta_version" INTEGER NOT NULL REFERENCES "dieta_version"("id") ON DELETE CASCADE,
    "id_ingrediente" INTEGER NOT NULL REFERENCES "ingrediente"("id") ON DELETE RESTRICT,
    "porcentaje" NUMERIC(5,2) NOT NULL CHECK ("porcentaje" > 0 AND "porcentaje" <= 100),
    CONSTRAINT "uq_dieta_version_ingrediente" UNIQUE ("id_dieta_version", "id_ingrediente")
);

CREATE INDEX IF NOT EXISTS "idx_dvi_version" ON "dieta_version_ingrediente" ("id_dieta_version");
