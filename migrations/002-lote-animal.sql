-- Gabino Gestión de Hacienda — Lotes (partidas de animales)
--
-- Entidad "animal" según la planilla LOTE LEO VULICH.xlsx, hoja PESAJE ING-EGR
-- (fila 5): N° ANIMAL, SEXO, PELAJE, FECHA, PESO INICIAL, DESBASTE, PESO NETO
-- (ingreso) y FECHA, PESO FINAL, DESBASTE, PESO NETO, DIFERENCIA, AUM. DIARIO,
-- OBSERVACIONES (egreso). Los valores netos/diferencia/aum diario se calculan
-- server-side; acá se guardan denormalizados para listar rápido.
--
-- Las migraciones se aplican a mano (synchronize: false en TypeORM).

-- Lote (partida de animales) hospedado por una empresa, con dueño opcional (cliente)
CREATE TABLE IF NOT EXISTS "lote" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER NOT NULL REFERENCES "empresa"("id") ON DELETE CASCADE,
    "id_cliente" VARCHAR(128),
    "nombre" VARCHAR(200) NOT NULL,
    "descripcion" TEXT,
    "fecha" DATE,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    "activo" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS "idx_lote_empresa" ON "lote" ("id_empresa");

-- Animal (cabeza de ganado) dentro de un lote
CREATE TABLE IF NOT EXISTS "animal" (
    "id" SERIAL PRIMARY KEY,
    "id_lote" INTEGER NOT NULL REFERENCES "lote"("id") ON DELETE CASCADE,
    "n_animal" INTEGER,
    "sexo" VARCHAR(20),
    "pelaje" VARCHAR(50),
    "fecha_pesaje_ini" DATE,
    "peso_inicial" NUMERIC(10,2),
    "desbaste_ini" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "peso_neto_ini" NUMERIC(10,2),
    "fecha_pesaje_fin" DATE,
    "peso_final" NUMERIC(10,2),
    "desbaste_fin" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "peso_neto_fin" NUMERIC(10,2),
    "diferencia" NUMERIC(10,2),
    "aum_diario" NUMERIC(10,4),
    "observaciones" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_animal_lote" ON "animal" ("id_lote");