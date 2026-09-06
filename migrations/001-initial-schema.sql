-- Gabino Gestión de Hacienda — Initial Migration
--
-- Convenciones:
--  * "usuario" y "cliente" NO existen como tabla: la identidad vive en
--    Firestore (colección "usuarios"). La relación empresa↔cliente se guarda
--    en esta tabla (fuente de verdad); en Firestore el cliente lleva un
--    espejo denormalizado `idEmpresas` (array de ids de la tabla empresa)
--    para que la auth resuelva permisos sin pegarle a la BD por request.
--  * El anfitrión y el operario guardan su empresa en el campo singular
--    `idEmpresa` de su documento en Firestore (relación 1:1, sin tabla).
--  * Las migraciones se aplican a mano (synchronize: false en TypeORM).

-- Empresa (hospeda lotes de ganado de clientes)
CREATE TABLE IF NOT EXISTS "empresa" (
    "id" SERIAL PRIMARY KEY,
    "nombre" VARCHAR NOT NULL,
    "direccion" VARCHAR,
    "telefono" VARCHAR,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
    "activo" BOOLEAN NOT NULL DEFAULT TRUE
);

-- Relación empresa ↔ cliente (muchos a muchos)
CREATE TABLE IF NOT EXISTS "empresa_cliente" (
    "id" SERIAL PRIMARY KEY,
    "id_empresa" INTEGER NOT NULL REFERENCES "empresa"("id") ON DELETE CASCADE,
    "id_cliente" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "uq_empresa_cliente" UNIQUE ("id_empresa", "id_cliente")
);

CREATE INDEX IF NOT EXISTS "idx_empresa_cliente_empresa"
    ON "empresa_cliente" ("id_empresa");
CREATE INDEX IF NOT EXISTS "idx_empresa_cliente_cliente"
    ON "empresa_cliente" ("id_cliente");