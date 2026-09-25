-- Gabino Gestión de Hacienda — Alimentación liquidada
--
-- `alimentacion.liquidada`: marca si el evento ya fue liquidado (etapa
-- posterior: liquidaciones). Default FALSE. Una alimentación liquidada NO se
-- puede eliminar (borrado físico sólo si no está liquidada).
--
-- Aplicar a mano (synchronize: false en TypeORM).

ALTER TABLE alimentacion
  ADD COLUMN IF NOT EXISTS liquidada BOOLEAN NOT NULL DEFAULT FALSE;
