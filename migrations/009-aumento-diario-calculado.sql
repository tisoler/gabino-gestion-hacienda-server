-- Gabino Gestión de Hacienda — Aumento diario deja de almacenarse
--
-- El aumento diario ahora se CALCULA al consultar el lote (`/lotes/:id`) sobre
-- la serie de pesajes: (último peso − peso inicial) / días. Se elimina la
-- columna `animal.aum_diario`.
--
-- Aplicar a mano (synchronize: false en TypeORM).

ALTER TABLE "animal" DROP COLUMN IF EXISTS "aum_diario";
