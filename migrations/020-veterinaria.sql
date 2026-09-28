-- Gabino Gestión de Hacienda — Veterinaria: tratamientos e insumos
--
-- `tratamiento`: catálogo de tratamientos (nombre, descripción opcional,
--   precio de referencia, alcance global o por empresa). Sin categorías.
-- `tratamiento_aplicado`: aplicación de un tratamiento a UN animal
--   (`id_animal` requerido). `id_movimiento` opcional: presente cuando nace de
--   un movimiento a/desde enfermería; NULL en aplicaciones directas (modal de
--   historial) o masivas al lote. `alcance` = 'animal' (individual, con o sin
--   movimiento) | 'lote' (aplicación masiva al lote). `fecha`+`hora` = instante
--   del tratamiento (para el orden cronológico del historial).
-- `tratamiento_aplicado_insumo`: insumos del tratamiento aplicado (uno o más),
--   cada uno con su precio al momento de aplicar.
--
-- Aplicar a mano (synchronize: false en TypeORM).

-- ============================================================================
-- Catálogo de tratamientos
-- ============================================================================

CREATE TABLE IF NOT EXISTS "tratamiento" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),
    "precio_referencia" NUMERIC(12,2),
    "activo" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

-- Unicidad por alcance (global = COALESCE 0) y nombre case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tratamiento_empresa_nombre"
    ON "tratamiento" (COALESCE("id_empresa", 0), LOWER("nombre"));
CREATE INDEX IF NOT EXISTS "idx_tratamiento_empresa_activo"
    ON "tratamiento" ("id_empresa", "activo");

-- ============================================================================
-- Tratamiento aplicado a un animal
-- ============================================================================

CREATE TABLE IF NOT EXISTS "tratamiento_aplicado" (
    "id" SERIAL PRIMARY KEY,
    "id_animal" INTEGER NOT NULL REFERENCES "animal"("id") ON DELETE CASCADE,
    "id_movimiento" INTEGER REFERENCES "animal_movimiento"("id") ON DELETE SET NULL,
    "id_tratamiento" INTEGER NOT NULL REFERENCES "tratamiento"("id") ON DELETE RESTRICT,
    "precio" NUMERIC(12,2),
    "fecha" DATE NOT NULL,
    "hora" TIME NOT NULL DEFAULT '12:00:00',
    "alcance" VARCHAR(10) NOT NULL DEFAULT 'animal'
        CONSTRAINT "ck_tratamiento_aplicado_alcance" CHECK ("alcance" IN ('animal', 'lote')),
    "id_usuario" VARCHAR(128),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_tratamiento_aplicado_animal"
    ON "tratamiento_aplicado" ("id_animal", "fecha" DESC, "hora" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_tratamiento_aplicado_movimiento"
    ON "tratamiento_aplicado" ("id_movimiento");

-- ============================================================================
-- Insumos del tratamiento aplicado
-- ============================================================================

CREATE TABLE IF NOT EXISTS "tratamiento_aplicado_insumo" (
    "id" SERIAL PRIMARY KEY,
    "id_tratamiento_aplicado" INTEGER NOT NULL
        REFERENCES "tratamiento_aplicado"("id") ON DELETE CASCADE,
    "id_insumo" INTEGER NOT NULL REFERENCES "insumo"("id") ON DELETE RESTRICT,
    "precio" NUMERIC(12,2)
);

CREATE INDEX IF NOT EXISTS "idx_tai_aplicado"
    ON "tratamiento_aplicado_insumo" ("id_tratamiento_aplicado");
