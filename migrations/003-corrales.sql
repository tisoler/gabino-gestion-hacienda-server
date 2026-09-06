-- Gabino Gestión de Hacienda — Corrales + ubicación/estado de animales
--
-- Modelo derivado:
--  * lote.id_corral: la partida está en un corral COMÚN. Un corral común tiene
--    a lo sumo un lote activo → el estado libre/ocupado se DERIVA (existe un
--    lote activo con ese id_corral), no se almacena.
--  * animal.id_corral_enfermeria: sólo la excepción. Seteado => el animal está
--    en ese corral de enfermería; null => su ubicación es la de su lote
--    (lote.id_corral). "Traer de enfermería" = limpiar el campo (vuelve
--    automáticamente al corral actual del lote).
--
-- Aplicar a mano (synchronize: false en TypeORM).

-- Corral de una empresa (común: aloja un lote; enfermería: animales sueltos)
CREATE TABLE IF NOT EXISTS "corral" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER NOT NULL REFERENCES "empresa"("id") ON DELETE CASCADE,
    "nombre" VARCHAR(100) NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "capacidad" INTEGER,
    "descripcion" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    "activo" BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT "chk_corral_tipo" CHECK ("tipo" IN ('comun', 'enfermeria'))
);

CREATE INDEX IF NOT EXISTS "idx_corral_empresa" ON "corral" ("id_empresa");

-- Lote: corral común que lo hospeda + color para el mapa
ALTER TABLE "lote"
    ADD COLUMN IF NOT EXISTS "id_corral" INTEGER REFERENCES "corral"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "color" VARCHAR(9);

CREATE INDEX IF NOT EXISTS "idx_lote_corral" ON "lote" ("id_corral");

-- Animal: enfermería (sólo cuando está movido) + estado sanitario
ALTER TABLE "animal"
    ADD COLUMN IF NOT EXISTS "id_corral_enfermeria" INTEGER REFERENCES "corral"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "estado" VARCHAR(10) NOT NULL DEFAULT 'sano';

DO $$ BEGIN
    ALTER TABLE "animal"
        ADD CONSTRAINT "chk_animal_estado" CHECK ("estado" IN ('sano', 'enfermo', 'muerto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_animal_enfermeria" ON "animal" ("id_corral_enfermeria");