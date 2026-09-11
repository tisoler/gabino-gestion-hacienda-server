-- Gabino Gestión de Hacienda — Pesajes como serie temporal por animal
--
-- Modelo: la tabla `pesaje` es la FUENTE DE VERDAD de los pesos. Cada fila es
-- UN peso de UN animal en UNA fecha, con su desbaste opcional y su peso neto
-- (peso - desbaste). Tipos: 'inicial' (base), 'intermedio' (N por animal) y
-- 'final' (egreso). El "peso total del lote" NUNCA se almacena: se SUMA por
-- fecha desde los pesajes por animal (aunque la UI permita cargar por total,
-- el server lo reparte por animal).
--
-- Las columnas de animal (peso_inicial/fecha_pesaje_ini/... y peso_final/...)
-- se conservan como PROYECCIÓN denormalizada (inicial = pesaje 'inicial',
-- final = pesaje 'final'), recalculadas por el server a cada cambio de pesaje
-- para no romper la planilla PESAJE ING-EGR ni las vistas existentes.
--
-- Aplicar a mano (synchronize: false en TypeORM).

CREATE TABLE IF NOT EXISTS "pesaje" (
    "id" SERIAL PRIMARY KEY,
    "id_animal" INTEGER NOT NULL REFERENCES "animal"("id") ON DELETE CASCADE,
    "fecha" DATE NOT NULL,
    -- 'inicial' | 'intermedio' | 'final'
    "tipo" VARCHAR(12) NOT NULL DEFAULT 'intermedio',
    "peso" NUMERIC(10,2) NOT NULL,
    "desbaste" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "peso_neto" NUMERIC(10,2),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "chk_pesaje_tipo" CHECK ("tipo" IN ('inicial', 'intermedio', 'final'))
);

CREATE INDEX IF NOT EXISTS "idx_pesaje_animal" ON "pesaje" ("id_animal", "fecha");
CREATE INDEX IF NOT EXISTS "idx_pesaje_fecha" ON "pesaje" ("fecha");

-- Un solo pesaje por (animal, tipo, fecha).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pesaje_animal_tipo_fecha"
    ON "pesaje" ("id_animal", "tipo", "fecha");

-- Seed: migrar los pesos hoy denormalizados en `animal` a filas de `pesaje`.
-- Inicial.
INSERT INTO "pesaje" ("id_animal", "fecha", "tipo", "peso", "desbaste", "peso_neto")
SELECT a."id", a."fecha_pesaje_ini", 'inicial', a."peso_inicial",
       COALESCE(a."desbaste_ini", 0), a."peso_neto_ini"
FROM "animal" a
WHERE a."peso_inicial" IS NOT NULL AND a."fecha_pesaje_ini" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "pesaje" p
      WHERE p."id_animal" = a."id" AND p."tipo" = 'inicial'
        AND p."fecha" = a."fecha_pesaje_ini"
  );

-- Final (egreso).
INSERT INTO "pesaje" ("id_animal", "fecha", "tipo", "peso", "desbaste", "peso_neto")
SELECT a."id", a."fecha_pesaje_fin", 'final', a."peso_final",
       COALESCE(a."desbaste_fin", 0), a."peso_neto_fin"
FROM "animal" a
WHERE a."peso_final" IS NOT NULL AND a."fecha_pesaje_fin" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "pesaje" p
      WHERE p."id_animal" = a."id" AND p."tipo" = 'final'
        AND p."fecha" = a."fecha_pesaje_fin"
  );
