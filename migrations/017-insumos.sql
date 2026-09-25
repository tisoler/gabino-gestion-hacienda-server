-- Gabino Gestión de Hacienda — Módulo de insumos
--
-- `categoria_insumo`: categorías de insumos (p.ej. "Fertilizante", "Semilla").
--   `id_empresa` NULL = GLOBAL (visible para todas las empresas); con valor =
--   creada por/para esa empresa. Se crean inline desde el modal de insumo
--   (igual que los ingredientes en la dieta): si el nombre no existe, el server
--   la crea con el alcance del insumo.
-- `insumo`: nombre, descripción opcional, precio de referencia (número, sin
--   moneda), unidad ('kg' | 'unidad') y alcance (global o de una empresa).
--   `activo` = ON/OFF manual (con escritura:insumo).
--
-- Aplicar a mano (synchronize: false en TypeORM).

-- ============================================================================
-- Categoría de insumo
-- ============================================================================

CREATE TABLE IF NOT EXISTS "categoria_insumo" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),
    "activa" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

-- Unicidad por alcance (global = COALESCE 0) y nombre case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_categoria_insumo_empresa_nombre"
    ON "categoria_insumo" (COALESCE("id_empresa", 0), LOWER("nombre"));
CREATE INDEX IF NOT EXISTS "idx_categoria_insumo_empresa"
    ON "categoria_insumo" ("id_empresa");

-- ============================================================================
-- Insumo
-- ============================================================================

CREATE TABLE IF NOT EXISTS "insumo" (
    "id" SERIAL PRIMARY KEY,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),
    "id_categoria" INTEGER REFERENCES "categoria_insumo"("id") ON DELETE RESTRICT,
    "id_empresa" INTEGER REFERENCES "empresa"("id") ON DELETE CASCADE,
    "precio_referencia" NUMERIC(12,2),
    "unidad" VARCHAR(20),
    "activo" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

-- Un insumo por alcance y nombre (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_insumo_empresa_nombre"
    ON "insumo" (COALESCE("id_empresa", 0), LOWER("nombre"));
CREATE INDEX IF NOT EXISTS "idx_insumo_empresa_activo"
    ON "insumo" ("id_empresa", "activo");
CREATE INDEX IF NOT EXISTS "idx_insumo_categoria" ON "insumo" ("id_categoria");
