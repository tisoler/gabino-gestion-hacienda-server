-- Gabino Gestión de Hacienda — Alimentación: proporción de enfermería
--
-- La cantidad ingresada (`cantidad_kg`) es la del CORRAL (los animales que
-- están físicamente ahí). Los animales del lote que están en enfermería reciben
-- una ESTIMACIÓN adicional a la misma tasa por animal (se SUMAN al total, no se
-- reparten del corral), porque en enfermería se alimenta junto a animales de
-- otros corrales/lotes.
--
-- `alimentacion`:
--   cantidad_kg = total (corral + enfermería)
--   cantidad_corral_kg = lo ingresado (corral)
--   cantidad_enfermeria_kg = tasa × n_animales_enfermeria
--   n_animales = animales vivos en el corral · n_animales_enfermeria = en enfermería
-- `alimentacion_lote`: igual desglose por lote.
--
-- Aplicar a mano (synchronize: false en TypeORM).

ALTER TABLE "alimentacion"
    ADD COLUMN IF NOT EXISTS "cantidad_corral_kg" NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS "cantidad_enfermeria_kg" NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "n_animales_enfermeria" INTEGER NOT NULL DEFAULT 0;

-- Filas existentes: todo era del corral.
UPDATE "alimentacion" SET "cantidad_corral_kg" = "cantidad_kg"
WHERE "cantidad_corral_kg" IS NULL;

ALTER TABLE "alimentacion" ALTER COLUMN "cantidad_corral_kg" SET NOT NULL;

ALTER TABLE "alimentacion_lote"
    ADD COLUMN IF NOT EXISTS "n_animales_enfermeria" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "cantidad_enfermeria_kg" NUMERIC(12,2) NOT NULL DEFAULT 0;