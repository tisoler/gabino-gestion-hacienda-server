-- Gabino Gestión de Hacienda — Fecha+hora en movimientos, salidas y alimentaciones,
-- e historial de asignación lote↔corral (intervalos de validez).
--
-- Objetivo: poder reconstruir la composición de un corral en un instante dado
-- (fecha + hora) para calcular el reparto de una alimentación histórica.
--
-- Aplicar a mano (synchronize: false en TypeORM).

-- 1) Hora en alimentación y salida (default 12:00).
ALTER TABLE "alimentacion"
    ADD COLUMN IF NOT EXISTS "hora" TIME NOT NULL DEFAULT '12:00:00';
ALTER TABLE "salida"
    ADD COLUMN IF NOT EXISTS "hora" TIME NOT NULL DEFAULT '12:00:00';

-- 2) Fecha + hora de negocio en movimientos (backfill desde created_at).
ALTER TABLE "animal_movimiento"
    ADD COLUMN IF NOT EXISTS "fecha" DATE,
    ADD COLUMN IF NOT EXISTS "hora" TIME;
UPDATE "animal_movimiento"
   SET "fecha" = "created_at"::date, "hora" = "created_at"::time
 WHERE "fecha" IS NULL OR "hora" IS NULL;
ALTER TABLE "animal_movimiento"
    ALTER COLUMN "fecha" SET NOT NULL,
    ALTER COLUMN "hora" SET NOT NULL;

-- 3) Historial de asignación lote↔corral (intervalo vigente hasta/hasta NULL).
CREATE TABLE IF NOT EXISTS "lote_corral_asignacion" (
    "id" SERIAL PRIMARY KEY,
    "id_lote" INTEGER NOT NULL REFERENCES "lote"("id") ON DELETE CASCADE,
    "id_corral" INTEGER NOT NULL REFERENCES "corral"("id") ON DELETE CASCADE,
    "desde" TIMESTAMP NOT NULL,
    "hasta" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_lca_corral_rango"
    ON "lote_corral_asignacion" ("id_corral", "desde", "hasta");
CREATE INDEX IF NOT EXISTS "idx_lca_lote"
    ON "lote_corral_asignacion" ("id_lote");

-- Backfill: un intervalo vigente por lote con corral (desde = fecha del lote o created_at).
INSERT INTO "lote_corral_asignacion" (id_lote, id_corral, desde, hasta)
SELECT l.id, l.id_corral, COALESCE(l.fecha::timestamp, l.created_at), NULL
FROM "lote" l
WHERE l.id_corral IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "lote_corral_asignacion" a
      WHERE a.id_lote = l.id AND a.hasta IS NULL
  );