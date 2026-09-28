-- Gabino Gestión de Hacienda — Tratamientos: bandera de liquidada
--
-- `tratamiento_aplicado.liquidada`: marca si el tratamiento ya fue liquidado.
-- Las liquidaciones pueden ser parciales (fila por fila), así que la bandera
-- va en el detalle y no en la cabecera. Default FALSE.
--
-- Aplicar a mano (synchronize: false en TypeORM).

ALTER TABLE tratamiento_aplicado
  ADD COLUMN IF NOT EXISTS liquidada BOOLEAN NOT NULL DEFAULT FALSE;
