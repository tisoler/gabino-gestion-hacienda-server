-- Gabino Gestión de Hacienda — Cantidad y unidad en insumos aplicados
--
-- `tratamiento_aplicado_insumo.cantidad`: cantidad de insumo registrada al
-- aplicar (p. ej. desde la importación de planillas Excel, columna CANTIDAD).
-- `tratamiento_aplicado_insumo.unidad`: unidad de esa cantidad
-- ('kg' | 'unidad' | 'ml', igual que `insumo.unidad`).
-- Ambas son informativas: el costo se sigue congelando por precio al liquidar.
--
-- Aplicar a mano (synchronize: false en TypeORM).

ALTER TABLE tratamiento_aplicado_insumo
  ADD COLUMN IF NOT EXISTS cantidad DECIMAL(12, 2) NULL;

ALTER TABLE tratamiento_aplicado_insumo
  ADD COLUMN IF NOT EXISTS unidad VARCHAR(16) NULL;
