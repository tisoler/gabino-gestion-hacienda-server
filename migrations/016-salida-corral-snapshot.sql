-- Gabino Gestión de Hacienda — Snapshot del corral en la salida.
--
-- La vista de salidas debe mostrar el corral donde estaba el lote AL MOMENTO de
-- la salida, no el corral actual del lote. `lote.id_corral` puede pasar a NULL
-- (o cambiar) después de una salida total, así que la salida congela su propio
-- `id_corral`.
--
-- Aplicar a mano (synchronize: false en TypeORM).

ALTER TABLE "salida"
    ADD COLUMN IF NOT EXISTS "id_corral" INTEGER REFERENCES "corral"("id");

CREATE INDEX IF NOT EXISTS "idx_salida_corral"
    ON "salida" ("id_corral");

-- Las salidas anteriores a esta columna quedan con `id_corral` NULL hasta que
-- se completen manualmente.
