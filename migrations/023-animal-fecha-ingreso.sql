-- Gabino Gestión de Hacienda — Fecha de ingreso del animal
--
-- `animal.fecha_ingreso` (DATE, negocio): fecha en que el animal ingresó al
-- lote. La elige el usuario al cargar animales (default: fecha del lote, entre
-- la fecha del lote y mañana). Es la base para reconstruir presencia histórica
-- (alimentación): NO se usa `partida.fecha` (las partidas se reordenan en los
-- pesajes iniciales) ni `created_at` (fecha de sistema, rompe con cargas tardías).
--
-- Backfill: `created_at::date` (zona Argentina). Si alguna carga fue tardía,
-- corregir `fecha_ingreso` a mano (edición masiva). Fallbacks por seguridad
-- (lote.fecha, fecha actual) sólo para no romper el NOT NULL.
--
-- Aplicar a mano (synchronize: false en TypeORM).

ALTER TABLE animal
  ADD COLUMN IF NOT EXISTS fecha_ingreso DATE;

UPDATE animal a
SET fecha_ingreso = COALESCE(
  (a.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  l.fecha,
  CURRENT_DATE
)
FROM lote l
WHERE l.id = a.id_lote
  AND a.fecha_ingreso IS NULL;

-- Red de seguridad: ningún NULL antes del NOT NULL.
UPDATE animal
SET fecha_ingreso = CURRENT_DATE
WHERE fecha_ingreso IS NULL;

ALTER TABLE animal
  ALTER COLUMN fecha_ingreso SET NOT NULL;
