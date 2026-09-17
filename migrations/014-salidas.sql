-- Gabino Gestión de Hacienda — Salidas de animales (egreso / entrega)
--
-- Da salida a animales NO muertos de un lote (total o parcial): lote completo,
-- partida completa o animales puntuales. El grupo que sale DEBE tener pesaje
-- final (se exige y se crea si falta) para poder calcular la diferencia de peso.
--
-- Nuevo estado `animal.estado = 'salido'`: el animal egresó y deja de
-- considerarse (no cuenta como vivo para alimentación/pesajes/promedios).
--
-- `salida` (evento) + `salida_animal` (detalle por animal, con snapshot de
-- pesos para el histórico; no se deforma si luego se editan pesajes).
--
-- Aplicar a mano (synchronize: false en TypeORM).

-- 1) Ampliar el CHECK de estado con 'salido'.
ALTER TABLE "animal" DROP CONSTRAINT IF EXISTS "chk_animal_estado";
DO $$ BEGIN
    ALTER TABLE "animal"
        ADD CONSTRAINT "chk_animal_estado"
        CHECK ("estado" IN ('sano', 'enfermo', 'muerto', 'salido'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Evento de salida.
CREATE TABLE IF NOT EXISTS "salida" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER NOT NULL REFERENCES "empresa"("id") ON DELETE CASCADE,
    "id_lote" INTEGER NOT NULL REFERENCES "lote"("id") ON DELETE CASCADE,
    "id_partida" INTEGER REFERENCES "partida"("id") ON DELETE SET NULL,
    "fecha" DATE NOT NULL,
    "tipo" VARCHAR(12) NOT NULL,
    "n_animales" INTEGER NOT NULL,
    "peso_inicial_total" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "peso_final_total" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "diferencia_kg" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "id_usuario" VARCHAR(128),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "chk_salida_tipo" CHECK ("tipo" IN ('lote', 'partida', 'animales'))
);

CREATE INDEX IF NOT EXISTS "idx_salida_empresa_fecha"
    ON "salida" ("id_empresa", "fecha" DESC);
CREATE INDEX IF NOT EXISTS "idx_salida_lote" ON "salida" ("id_lote");

-- 3) Detalle por animal (snapshot de pesos al momento de la salida).
CREATE TABLE IF NOT EXISTS "salida_animal" (
    "id" SERIAL PRIMARY KEY,
    "id_salida" INTEGER NOT NULL REFERENCES "salida"("id") ON DELETE CASCADE,
    "id_animal" INTEGER NOT NULL REFERENCES "animal"("id") ON DELETE CASCADE,
    "peso_inicial" NUMERIC(10,2),
    "peso_final" NUMERIC(10,2) NOT NULL,
    "diferencia_kg" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_salida_animal_salida" ON "salida_animal" ("id_salida");
CREATE INDEX IF NOT EXISTS "idx_salida_animal_animal" ON "salida_animal" ("id_animal");