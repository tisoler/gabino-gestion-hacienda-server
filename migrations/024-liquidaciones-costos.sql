-- Gabino Gestión de Hacienda — Liquidaciones con precios congelados + costos varios
--
-- `costo`: catálogo de costos varios (nombre, descripción opcional, precio de
--   referencia, alcance global o por empresa). Sin categorías.
-- `costo_aplicado`: costo imputado a UN lote (`id_lote` + `fecha` + `monto` +
--   `descripcion`). `liquidada` indica si ya entró en una liquidación.
-- `liquidacion`: cabecera de una liquidación de un lote ("lote de ítems
--   pagados"): `id_lote` + `fecha` + `total` (calculado por el server).
-- `liquidacion_item`: líneas de precio CONGELADO al liquidar (una por precio
--   editable): alimentación = 1 línea (evento: kg × $/kg); tratamiento aplicado
--   = 1 línea base + N líneas de insumos; costo = 1 línea (monto). El balance
--   usa estas líneas cuando el ítem está liquidado y referencias vivas cuando no.
--
-- Sin backfill: las liquidaciones previas eran de prueba y se descartan, por
-- eso se resetean las banderas `liquidada` (pizarra limpia).
--
-- Aplicar a mano (synchronize: false en TypeORM).

-- ============================================================================
-- Catálogo de costos varios
-- ============================================================================

CREATE TABLE IF NOT EXISTS "costo" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "uq_costo_empresa_nombre"
    ON "costo" (COALESCE("id_empresa", 0), LOWER("nombre"));
CREATE INDEX IF NOT EXISTS "idx_costo_empresa_activo"
    ON "costo" ("id_empresa", "activo");

-- ============================================================================
-- Costo aplicado a un lote
-- ============================================================================

CREATE TABLE IF NOT EXISTS "costo_aplicado" (
    "id" SERIAL PRIMARY KEY,
    "id_costo" INTEGER NOT NULL REFERENCES "costo"("id") ON DELETE RESTRICT,
    "id_lote" INTEGER NOT NULL REFERENCES "lote"("id") ON DELETE CASCADE,
    "id_empresa" INTEGER NOT NULL REFERENCES "empresa"("id") ON DELETE CASCADE,
    "fecha" DATE NOT NULL,
    "descripcion" VARCHAR(255) NOT NULL,
    "monto" NUMERIC(12,2) NOT NULL,
    "liquidada" BOOLEAN NOT NULL DEFAULT FALSE,
    "id_usuario" VARCHAR(128),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_costo_aplicado_lote"
    ON "costo_aplicado" ("id_lote", "fecha" DESC, "id" DESC);

-- ============================================================================
-- Liquidaciones (cabecera + líneas congeladas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "liquidacion" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER NOT NULL REFERENCES "empresa"("id") ON DELETE CASCADE,
    "id_lote" INTEGER NOT NULL REFERENCES "lote"("id") ON DELETE CASCADE,
    "fecha" DATE NOT NULL,
    "total" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "id_usuario" VARCHAR(128),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_liquidacion_lote"
    ON "liquidacion" ("id_lote", "fecha" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_liquidacion_empresa"
    ON "liquidacion" ("id_empresa", "fecha" DESC, "id" DESC);

CREATE TABLE IF NOT EXISTS "liquidacion_item" (
    "id" SERIAL PRIMARY KEY,
    "id_liquidacion" INTEGER NOT NULL REFERENCES "liquidacion"("id") ON DELETE CASCADE,
    "tipo" VARCHAR(20) NOT NULL
        CONSTRAINT "ck_liquidacion_item_tipo" CHECK ("tipo" IN ('alimentacion', 'tratamiento', 'costo')),
    "id_referencia" INTEGER NOT NULL,
    "concepto" VARCHAR(20) NOT NULL
        CONSTRAINT "ck_liquidacion_item_concepto" CHECK ("concepto" IN ('evento', 'tratamiento', 'insumo', 'costo')),
    "etiqueta" VARCHAR(255) NOT NULL,
    "cantidad" NUMERIC(12,2),
    "precio" NUMERIC(12,2),
    "costo" NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_liquidacion_item_liquidacion"
    ON "liquidacion_item" ("id_liquidacion");

-- ============================================================================
-- Pizarra limpia: las liquidaciones previas eran de prueba y se descartan.
-- ============================================================================

UPDATE "alimentacion" SET "liquidada" = FALSE WHERE "liquidada" = TRUE;
UPDATE "tratamiento_aplicado" SET "liquidada" = FALSE WHERE "liquidada" = TRUE;
