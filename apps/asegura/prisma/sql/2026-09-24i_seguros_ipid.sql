-- 2026-09-24 — Fichas IPID (documento de información del producto de seguro, Reglamento (UE)
-- 2017/1469). Una por compañía + producto, reutilizable en todos los presupuestos. Es un documento
-- PÚBLICO de la compañía (sin datos de nadie), por eso el portal lo puede leer y servir al cliente.
-- `clave` = compañía|producto normalizados (`claveProducto` de `@central/module-seguros`). Solo hay
-- una VIGENTE por clave; sustituirla retira la anterior (queda para lo ya firmado, que cita su huella).
--
-- ADITIVA. Reversible: DROP TABLE seguros.ipid.

CREATE TABLE IF NOT EXISTS seguros.ipid (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias(id),
  clave           text NOT NULL CHECK (length(clave) BETWEEN 3 AND 300),
  compania        text NOT NULL CHECK (length(btrim(compania)) BETWEEN 1 AND 120),
  producto        text NOT NULL CHECK (length(btrim(producto)) BETWEEN 1 AND 160),
  nombre_fichero  text NOT NULL,
  contenido       bytea NOT NULL CHECK (octet_length(contenido) BETWEEN 1 AND 4194304),
  sha256          text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  subido_por      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  retirado_at     timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ipid_vigente ON seguros.ipid (correduria_id, clave) WHERE retirado_at IS NULL;

REVOKE ALL ON seguros.ipid FROM crm_seguros;
REVOKE ALL ON seguros.ipid FROM anon, authenticated;
REVOKE TRUNCATE, DELETE ON seguros.ipid FROM prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.ipid TO prisma_seguros;
-- El portal lo sirve al cliente dentro de su presupuesto: es un documento público de producto.
REVOKE ALL ON seguros.ipid FROM prisma_asegura_portal;
GRANT SELECT (id, correduria_id, clave, compania, producto, nombre_fichero, contenido, sha256, created_at, retirado_at)
  ON seguros.ipid TO prisma_asegura_portal;
