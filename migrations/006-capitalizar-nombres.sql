-- Gabino Gestión de Hacienda — Normalización de nombres (capitalize)
--
-- Regla aplicada en el server para catálogos (raza, categoria, pelaje,
-- proveedor, lugar_origen, motivo) y corrales: primera letra de la PRIMERA
-- palabra en mayúscula y el resto en minúscula (ver `capitalizarNombre`,
-- src/utils/nombres.util.ts). Esta migración retroaplica la misma regla sobre
-- las filas existentes para que el histórico quede consistente.
--
-- Nota: la unicidad de los catálogos es por (empresa, LOWER(nombre)), así que
-- no pueden existir dos filas que colisionen al normalizar (una sola puede
-- sobrevivir por clave). El seed "Aberdeen-Angus" queda como "Aberdeen-angus"
-- por la regla pedida (solo la primera letra en mayúscula).
--
-- Aplicar a mano (synchronize: false en TypeORM).

CREATE OR REPLACE FUNCTION tmp_capitalizar(nombre TEXT) RETURNS TEXT AS $$
    SELECT CASE
        WHEN nombre IS NULL OR btrim(nombre) = '' THEN nombre
        ELSE upper(left(btrim(nombre), 1)) || substr(lower(btrim(nombre)), 2)
    END;
$$ LANGUAGE sql;

UPDATE "raza"          SET "nombre" = tmp_capitalizar("nombre") WHERE "nombre" IS DISTINCT FROM tmp_capitalizar("nombre");
UPDATE "categoria"     SET "nombre" = tmp_capitalizar("nombre") WHERE "nombre" IS DISTINCT FROM tmp_capitalizar("nombre");
UPDATE "pelaje"        SET "nombre" = tmp_capitalizar("nombre") WHERE "nombre" IS DISTINCT FROM tmp_capitalizar("nombre");
UPDATE "proveedor"     SET "nombre" = tmp_capitalizar("nombre") WHERE "nombre" IS DISTINCT FROM tmp_capitalizar("nombre");
UPDATE "lugar_origen"  SET "nombre" = tmp_capitalizar("nombre") WHERE "nombre" IS DISTINCT FROM tmp_capitalizar("nombre");
UPDATE "motivo"        SET "nombre" = tmp_capitalizar("nombre") WHERE "nombre" IS DISTINCT FROM tmp_capitalizar("nombre");
UPDATE "corral"        SET "nombre" = tmp_capitalizar("nombre") WHERE "nombre" IS DISTINCT FROM tmp_capitalizar("nombre");

-- Snapshot del motivo en el historial de movimientos (muestra lo que se vio
-- en su momento; se normaliza igual para que el listado se vea parejo).
UPDATE "animal_movimiento"
   SET "motivo" = tmp_capitalizar("motivo")
 WHERE "motivo" IS NOT NULL AND "motivo" IS DISTINCT FROM tmp_capitalizar("motivo");

DROP FUNCTION tmp_capitalizar(TEXT);
