-- Gabino Gestión de Hacienda — Partidas (subgrupos de animales dentro de un lote)
--
-- Un lote se carga por tandas ("partidas"). Cada partida agrupa los animales
-- ingresados juntos y tiene su propia fecha de carga y su PESAJE INICIAL. Los
-- pesajes INTERMEDIOS/FINALES son del LOTE (todos los animales, sin importar
-- las partidas). Si un lote tiene una sola partida, la UI NO muestra la
-- división (se comporta como un lote simple).
--
-- `partida`: id, id_lote, fecha (DATE de carga), timestamps. El nombre
-- ("Partida 1", "Partida 2", …) se DERIVA ordenando por fecha/id dentro del
-- lote, no se guarda.
-- `animal.id_partida`: FK a partida (SET NULL si se borra la partida).
--
-- Backfill: una partida por (lote, fecha de carga) usando
-- COALESCE(fecha_pesaje_ini, created_at) (sólo la parte fecha).
--
-- Aplicar a mano (synchronize: false en TypeORM).

CREATE TABLE IF NOT EXISTS "partida" (
    "id" SERIAL PRIMARY KEY,
    "id_lote" INTEGER NOT NULL REFERENCES "lote"("id") ON DELETE CASCADE,
    "fecha" DATE NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_partida_lote_fecha" ON "partida" ("id_lote", "fecha");

ALTER TABLE "animal"
    ADD COLUMN IF NOT EXISTS "id_partida" INTEGER REFERENCES "partida"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_animal_partida" ON "animal" ("id_partida");

-- 1) Crear una partida por (lote, fecha de carga) de los animales existentes.
INSERT INTO "partida" ("id_lote", "fecha")
SELECT DISTINCT
    a."id_lote",
    COALESCE(DATE(a."fecha_pesaje_ini"), DATE(a."created_at")) AS "fecha"
FROM "animal" a
WHERE NOT EXISTS (
    SELECT 1 FROM "partida" p
    WHERE p."id_lote" = a."id_lote"
      AND p."fecha" = COALESCE(DATE(a."fecha_pesaje_ini"), DATE(a."created_at"))
);

-- 2) Vincular cada animal con su partida (mismo lote y fecha de carga).
UPDATE "animal" a
SET "id_partida" = p."id"
FROM "partida" p
WHERE p."id_lote" = a."id_lote"
  AND p."fecha" = COALESCE(DATE(a."fecha_pesaje_ini"), DATE(a."created_at"))
  AND a."id_partida" IS NULL;
