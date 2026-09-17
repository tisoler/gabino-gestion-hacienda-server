-- Gabino Gestión de Hacienda — Dietas globales
--
-- `dieta.id_empresa` pasa a NULLABLE: NULL = dieta GLOBAL (visible y usable por
-- todas las empresas, análoga a los catálogos globales). El sys-admin puede
-- crear dietas/versiones para Global o para una empresa; el resto (con
-- escritura:dieta) sólo para la suya. Las versiones heredan el alcance de su
-- dieta (no se guarda empresa por versión).
--
-- Aplicar a mano (synchronize: false en TypeORM).

ALTER TABLE "dieta" ALTER COLUMN "id_empresa" DROP NOT NULL;

-- Unicidad por (empresa o global, nombre en lowercase), como los catálogos.
DROP INDEX IF EXISTS "uq_dieta_empresa_nombre";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_dieta_empresa_nombre"
    ON "dieta" (COALESCE("id_empresa", 0), LOWER("nombre"));

-- El listado por empresa ahora filtra "global o de la empresa".
CREATE INDEX IF NOT EXISTS "idx_dieta_empresa_activa" ON "dieta" ("id_empresa", "activa");
