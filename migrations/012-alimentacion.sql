-- Gabino Gestión de Hacienda — Alimentación de corrales (histórico)
--
-- Al alimentar un corral se prepara una cantidad (kg) de una dieta vigente y se
-- REPARTE entre los lotes del corral en proporción a la cantidad de animales
-- VIVOS de cada lote (los muertos no cuentan). Los animales del lote que están
-- en enfermería también reciben su proporción (se cuentan como animales del
-- lote). Se guarda el histórico para el reporte de costo.
--
-- `alimentacion`: evento de alimentación (corral + dieta + versión + fecha +
--   cantidad total + tasa por animal + total de animales vivos).
-- `alimentacion_lote`: reparto por lote (animales vivos contados + kg).
--   `id_cliente` es un snapshot del titular del lote (para filtrar el histórico
--   por cliente aunque el lote cambie de dueño).
--
-- Aplicar a mano (synchronize: false en TypeORM).

CREATE TABLE IF NOT EXISTS "alimentacion" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER NOT NULL REFERENCES "empresa"("id") ON DELETE CASCADE,
    "id_corral" INTEGER NOT NULL REFERENCES "corral"("id") ON DELETE RESTRICT,
    "id_dieta" INTEGER NOT NULL REFERENCES "dieta"("id") ON DELETE RESTRICT,
    "id_dieta_version" INTEGER NOT NULL REFERENCES "dieta_version"("id") ON DELETE RESTRICT,
    "fecha" DATE NOT NULL,
    "cantidad_kg" NUMERIC(12,2) NOT NULL,
    "cantidad_por_animal" NUMERIC(12,4) NOT NULL,
    "n_animales" INTEGER NOT NULL,
    "id_usuario" VARCHAR(128),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_alimentacion_empresa_fecha"
    ON "alimentacion" ("id_empresa", "fecha" DESC);
CREATE INDEX IF NOT EXISTS "idx_alimentacion_corral" ON "alimentacion" ("id_corral");
CREATE INDEX IF NOT EXISTS "idx_alimentacion_dieta" ON "alimentacion" ("id_dieta");

CREATE TABLE IF NOT EXISTS "alimentacion_lote" (
    "id" SERIAL PRIMARY KEY,
    "id_alimentacion" INTEGER NOT NULL REFERENCES "alimentacion"("id") ON DELETE CASCADE,
    "id_lote" INTEGER NOT NULL REFERENCES "lote"("id") ON DELETE CASCADE,
    "id_cliente" VARCHAR(128),
    "n_animales" INTEGER NOT NULL,
    "cantidad_kg" NUMERIC(12,2) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_alimentacion_lote_alimentacion"
    ON "alimentacion_lote" ("id_alimentacion");
CREATE INDEX IF NOT EXISTS "idx_alimentacion_lote_lote"
    ON "alimentacion_lote" ("id_lote");
CREATE INDEX IF NOT EXISTS "idx_alimentacion_lote_cliente"
    ON "alimentacion_lote" ("id_cliente");
