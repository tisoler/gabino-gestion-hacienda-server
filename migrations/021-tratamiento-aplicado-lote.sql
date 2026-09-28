-- Gabino Gestión de Hacienda — Veterinaria: cabecera de aplicación al lote
--
-- `tratamiento_aplicado_lote`: UNA fila por aplicación masiva al lote (el
-- evento de costo). Los `tratamiento_aplicado` con alcance='lote' cuelgan de
-- su cabecera (`id_aplicacion_lote`); los individuales lo dejan NULL.
-- Imputar costos = por cabecera (no por fila), sin duplicar.
--
-- Aplicar a mano (synchronize: false en TypeORM).

CREATE TABLE IF NOT EXISTS "tratamiento_aplicado_lote" (
    "id" SERIAL PRIMARY KEY,
    "id_lote" INTEGER NOT NULL REFERENCES "lote"("id") ON DELETE CASCADE,
    "fecha" DATE NOT NULL,
    "hora" TIME NOT NULL DEFAULT '12:00:00',
    "id_usuario" VARCHAR(128),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_tratamiento_aplicado_lote_lote"
    ON "tratamiento_aplicado_lote" ("id_lote", "fecha" DESC);

ALTER TABLE tratamiento_aplicado
  ADD COLUMN IF NOT EXISTS id_aplicacion_lote INTEGER
    REFERENCES tratamiento_aplicado_lote(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_tratamiento_aplicado_aplicacion"
    ON "tratamiento_aplicado" ("id_aplicacion_lote");

-- Backfill (idempotente): agrupa los alcance='lote' sin cabecera por
-- (lote, fecha, hora). Hoy normalmente vacío.
INSERT INTO tratamiento_aplicado_lote (id_lote, fecha, hora, id_usuario)
SELECT a.id_lote, ta.fecha, ta.hora, MIN(ta.id_usuario)
FROM tratamiento_aplicado ta
JOIN animal a ON a.id = ta.id_animal
WHERE ta.alcance = 'lote' AND ta.id_aplicacion_lote IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM tratamiento_aplicado_lote cab
    WHERE cab.id_lote = a.id_lote AND cab.fecha = ta.fecha AND cab.hora = ta.hora
  )
GROUP BY a.id_lote, ta.fecha, ta.hora;
