-- Gabino Gestión de Hacienda — Caravana, sexo en categoría, pelaje como catálogo
-- (M2M con raza) y migración de datos.
--
-- Cambios:
--  * animal: nuevo `caravana` (VARCHAR, requerido en la app; se deja NULL en BD
--    para no romper filas históricas) y `id_pelaje` (FK al catálogo `pelaje`).
--    Se ELIMINA `sexo` (se infiere de la categoría) y la columna texto `pelaje`
--    (pasa a ser catálogo con FK).
--  * categoria: nuevo `sexo` ('MACHO' | 'HEMBRA' | NULL=indistinto/ambos). Al
--    elegir categoría en el alta/edición de animal, la UI muestra el sexo.
--  * pelaje: catálogo multitenant (igual que raza). `raza_pelaje`: relación
--    N:N raza↔pelaje (un pelaje puede ser genérico —sin raza— o común a varias
--    razas). Al elegir raza, la UI filtra los pelajes asociados.
--
-- Aplicar a mano (synchronize: false en TypeORM).

-- ============================================================================
-- Categoría: sexo
-- ============================================================================

ALTER TABLE "categoria"
    ADD COLUMN IF NOT EXISTS "sexo" VARCHAR(10);

DO $$ BEGIN
    ALTER TABLE "categoria"
        ADD CONSTRAINT "chk_categoria_sexo" CHECK ("sexo" IN ('MACHO', 'HEMBRA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Pelaje (catálogo) + relación N:N con raza
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pelaje" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_pelaje_empresa_nombre"
    ON "pelaje" (COALESCE("id_empresa", 0), LOWER("nombre"));
CREATE INDEX IF NOT EXISTS "idx_pelaje_empresa" ON "pelaje" ("id_empresa");

-- Tabla intermedia raza↔pelaje (un pelaje puede pertenecer a 1 o N razas).
CREATE TABLE IF NOT EXISTS "raza_pelaje" (
    "id_raza" INTEGER NOT NULL REFERENCES "raza"("id") ON DELETE CASCADE,
    "id_pelaje" INTEGER NOT NULL REFERENCES "pelaje"("id") ON DELETE CASCADE,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY ("id_raza", "id_pelaje")
);

CREATE INDEX IF NOT EXISTS "idx_raza_pelaje_pelaje" ON "raza_pelaje" ("id_pelaje");

-- ============================================================================
-- Animal: caravana + id_pelaje; migración del texto `pelaje`; sin `sexo`
-- ============================================================================

ALTER TABLE "animal"
    ADD COLUMN IF NOT EXISTS "caravana" VARCHAR(50),
    ADD COLUMN IF NOT EXISTS "id_pelaje" INTEGER REFERENCES "pelaje"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_animal_pelaje" ON "animal" ("id_pelaje");
-- Caravana: única dentro del lote cuando está informada (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_animal_caravana_lote"
    ON "animal" ("id_lote", LOWER("caravana"))
    WHERE "caravana" IS NOT NULL;

-- 1) Crear los valores de `pelaje` a partir del texto actual de cada animal,
--    asociados a la empresa de su lote (idempotente, comparado en lowercase).
--    Se agrupa por LOWER para no violar el índice único con variantes de caja
--    (p. ej. "Colorado" y "colorado" en el mismo lote/empresa).
INSERT INTO "pelaje" ("id_empresa", "nombre")
SELECT e."id_empresa", e."nombre"
FROM (
    SELECT l."id_empresa" AS "id_empresa",
           MIN(TRIM(a."pelaje")) AS "nombre"
    FROM "animal" a
    JOIN "lote" l ON l."id" = a."id_lote"
    WHERE a."pelaje" IS NOT NULL AND TRIM(a."pelaje") <> ''
    GROUP BY l."id_empresa", LOWER(TRIM(a."pelaje"))
) e
WHERE NOT EXISTS (
    SELECT 1 FROM "pelaje" p
    WHERE p."id_empresa" = e."id_empresa"
      AND LOWER(p."nombre") = LOWER(e."nombre")
);

-- 2) Vincular cada animal a su `pelaje` (mismo texto y misma empresa).
UPDATE "animal" a
SET "id_pelaje" = p."id"
FROM "lote" l
JOIN "pelaje" p ON p."id_empresa" = l."id_empresa"
WHERE a."id_lote" = l."id"
  AND a."pelaje" IS NOT NULL AND TRIM(a."pelaje") <> ''
  AND LOWER(p."nombre") = LOWER(TRIM(a."pelaje"))
  AND a."id_pelaje" IS NULL;

-- 3) Eliminar la columna de texto y la de sexo.
ALTER TABLE "animal"
    DROP COLUMN IF EXISTS "pelaje",
    DROP COLUMN IF EXISTS "sexo";
