-- Gabino Gestión de Hacienda — Dietas compuestas por INSUMOS
--
-- Se elimina el catálogo `ingrediente`: la dieta se compone de insumos
-- (globales o de la empresa) con categoría "Ingrediente dieta".
--
-- 1) Categorías globales fijas (ids estables, nunca se borran: no hay API de
--    borrado de categorías): 1 = Ingrediente dieta, 2 = Veterinaria.
-- 2) Los ingredientes actuales se migran a insumos GLOBALES con categoría 1,
--    dedup insensible a acentos (prefiere la grafía con acento: "Maíz").
-- 3) `dieta_version_ingrediente` pasa a `dieta_version_insumo` (columna
--    `id_insumo`) y se elimina la tabla `ingrediente`.
--
-- Aplicar a mano (synchronize: false en TypeORM).

-- ============================================================================
-- 1) Categorías globales fijas
-- ============================================================================

-- Un solo loop para ambas: libera el id si lo ocupa otra categoría (la
-- renumera preservando sus insumos), inserta la fija, fusiona homónimas
-- globales con otro id y canoniza la fila.
DO $$
DECLARE
  r RECORD;
  v_nuevo INTEGER;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (1, 'Ingrediente dieta', 'Insumos aptos para componer dietas'),
      (2, 'Veterinaria', 'Insumos de uso veterinario')
    ) AS t(id, nombre, descripcion)
  LOOP
    IF EXISTS (SELECT 1 FROM categoria_insumo WHERE id = r.id AND LOWER(nombre) <> LOWER(r.nombre)) THEN
      SELECT COALESCE(MAX(id), 0) + 1 INTO v_nuevo FROM categoria_insumo;
      UPDATE insumo SET id_categoria = v_nuevo WHERE id_categoria = r.id;
      UPDATE categoria_insumo SET id = v_nuevo WHERE id = r.id;
    END IF;
    INSERT INTO categoria_insumo (id, id_empresa, nombre, descripcion, activa)
    VALUES (r.id, NULL, r.nombre, r.descripcion, TRUE)
    ON CONFLICT (id) DO NOTHING;
    UPDATE insumo SET id_categoria = r.id
    WHERE id_categoria IN (
      SELECT id FROM categoria_insumo
      WHERE LOWER(nombre) = LOWER(r.nombre) AND id_empresa IS NULL AND id <> r.id
    );
    DELETE FROM categoria_insumo
    WHERE LOWER(nombre) = LOWER(r.nombre) AND id_empresa IS NULL AND id <> r.id;
    UPDATE categoria_insumo
    SET nombre = r.nombre, id_empresa = NULL, descripcion = r.descripcion, activa = TRUE
    WHERE id = r.id;
  END LOOP;
END $$;

SELECT setval(
  'categoria_insumo_id_seq',
  (SELECT COALESCE(MAX(id), 0) FROM categoria_insumo)
);

-- ============================================================================
-- 2) Ingredientes -> insumos globales con categoría 1
-- ============================================================================

-- Dedup insensible a acentos y mayúsculas. `nombre DESC` prefiere la grafía
-- con acento ("Maíz" > "Maiz": í(237) > i(105)) y la capitalizada.
INSERT INTO insumo (nombre, descripcion, id_categoria, id_empresa, precio_referencia, unidad, activo)
SELECT DISTINCT ON (translate(LOWER(ig.nombre), 'áéíóúüñ', 'aeiouun'))
  ig.nombre, NULL, 1, NULL, NULL, NULL, TRUE
FROM ingrediente ig
ORDER BY
  translate(LOWER(ig.nombre), 'áéíóúüñ', 'aeiouun'),
  ig.nombre DESC,
  ig.id ASC;

-- ============================================================================
-- 3) dieta_version_ingrediente -> dieta_version_insumo
-- ============================================================================

ALTER TABLE dieta_version_ingrediente
  ADD COLUMN id_insumo INTEGER REFERENCES insumo(id) ON DELETE RESTRICT;

UPDATE dieta_version_ingrediente dvi
SET id_insumo = i.id
FROM ingrediente ig
JOIN insumo i
  ON translate(LOWER(i.nombre), 'áéíóúüñ', 'aeiouun')
     = translate(LOWER(ig.nombre), 'áéíóúüñ', 'aeiouun')
  AND i.id_empresa IS NULL
  AND i.id_categoria = 1
WHERE dvi.id_ingrediente = ig.id;

-- Si algún movimiento quedó sin mapear, el NOT NULL siguiente falla a
-- propósito: no se pierde ningún dato en silencio.
ALTER TABLE dieta_version_ingrediente ALTER COLUMN id_insumo SET NOT NULL;

-- Elimina la FK hacia `ingrediente` (nombre generado: se resuelve dinámico).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'dieta_version_ingrediente'::regclass
      AND contype = 'f'
      AND confrelid = 'ingrediente'::regclass
  LOOP
    EXECUTE format('ALTER TABLE dieta_version_ingrediente DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE dieta_version_ingrediente DROP COLUMN id_ingrediente;
ALTER TABLE dieta_version_ingrediente RENAME TO dieta_version_insumo;
-- La UNIQUE (id_dieta_version, id_ingrediente) cayó con la columna: se recrea.
ALTER TABLE dieta_version_insumo
  ADD CONSTRAINT uq_dieta_version_insumo UNIQUE (id_dieta_version, id_insumo);
ALTER INDEX idx_dvi_version RENAME TO idx_dieta_version_insumo_version;

DROP TABLE ingrediente;

SELECT setval('insumo_id_seq', (SELECT COALESCE(MAX(id), 0) FROM insumo));
