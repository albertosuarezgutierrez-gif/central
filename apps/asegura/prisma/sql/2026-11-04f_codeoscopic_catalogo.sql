-- 2026-11-04f — INSTANTÁNEAS del catálogo POR COMPAÑÍA de Avant2/Codeoscopic (todo GRATIS).
-- Código: apps/asegura/lib/codeoscopic/catalogo-companias.ts (lista cerrada de GET + mapeo, PURO),
-- catalogo-instantanea.ts (recorrido con pausa y tope ≤60), catalogo-companias-bd.ts (esta tabla),
-- rutas POST /api/operador/codeoscopic/catalogo/instantanea y GET /api/operador/codeoscopic/catalogo,
-- workflow .github/workflows/tarificador-relanzar.yml (accion=catalogo_avant2).
--
-- Qué guarda: cada POST deja UNA instantánea (mismo `instantanea_id`) con una fila por elemento:
--   tipo 'llamada'         → estado de cada GET (ok + nº de elementos / error + http): «no se pudo mirar» ≠ «no hay».
--   tipo 'ramo'            → /insurance-lines (activo, tarifica, emisión online…), `ramo` = id del vendor (Car, Home…).
--   tipo 'vendor'          → /insurance-vendors (vendor_id, vendor_nombre, descripción).
--   tipo 'producto'        → /insurance-lines/{ramo}/products: producto, vendor emparejado (NULL = no se sabe),
--                            `configs` [{id,nombre,imageUrl,favorita,brokerFee?}], `broker_fee` (NULL = no vino: la spec
--                            de este endpoint no lo trae; NUNCA [] ni 0), `extra` {descripcion, logo, emisionOnline…}.
--   tipo 'compania_dgs'    → /insurance-companies y /car|motorcycle/insurance-companies (código DGS en extra).
--   tipo 'frecuencia_pago' / 'forma_pago' → catálogos generales de pago (sin quoteId).
-- Sin datos personales: es catálogo. `correduria_id` porque el catálogo depende de la ORGANIZACIÓN de Avant2
-- (credenciales de la correduría): toda sentencia filtra por él (cepo regression-asegura-aislamiento).
--
-- 🚨 Fail-closed: sin esta tabla las dos rutas dan 503 `sin_migracion` y el POST NO llama al vendor.
-- La app (prisma_seguros) solo SELECT e INSERT: una instantánea no se edita ni se borra desde la app.
-- RLS activada sin policies (como el resto de seguros; prisma_seguros tiene BYPASSRLS).
--
-- ⚠️ NO APLICADA. En transacción. Se deshace con el bloque ROLLBACK del final.

BEGIN;

SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.codeoscopic_catalogo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instantanea_id  uuid NOT NULL,
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias(id),
  fecha           timestamptz NOT NULL DEFAULT now(),
  tipo            text NOT NULL CHECK (tipo IN ('llamada', 'ramo', 'vendor', 'producto', 'compania_dgs', 'frecuencia_pago', 'forma_pago')),
  fuente          text NOT NULL CHECK (length(fuente) BETWEEN 1 AND 200),
  ramo            text CHECK (ramo IS NULL OR ramo ~ '^[A-Za-z0-9_-]{1,40}$'),
  vendor_id       text,
  vendor_nombre   text,
  producto_id     text,
  producto_nombre text,
  configs         jsonb CHECK (configs IS NULL OR jsonb_typeof(configs) = 'array'),
  broker_fee      jsonb CHECK (broker_fee IS NULL OR jsonb_typeof(broker_fee) = 'array'),
  extra           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra) = 'object' AND pg_column_size(extra) <= 20000),
  CONSTRAINT codeoscopic_catalogo_producto_coherente CHECK (tipo <> 'producto' OR (producto_id IS NOT NULL AND ramo IS NOT NULL))
);

-- Lectura de la última instantánea por correduría.
CREATE INDEX IF NOT EXISTS idx_codeoscopic_catalogo_ultima ON seguros.codeoscopic_catalogo (correduria_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_codeoscopic_catalogo_instantanea ON seguros.codeoscopic_catalogo (instantanea_id);

COMMENT ON TABLE seguros.codeoscopic_catalogo IS
  'Instantáneas del catálogo POR COMPAÑÍA de Avant2 (solo GET gratis: ramos, vendors, productos+configs, compañías DGS, '
  'formas/frecuencias de pago). broker_fee NULL = no vino (no se sabe). Sin PII. App: SELECT e INSERT.';

ALTER TABLE seguros.codeoscopic_catalogo ENABLE ROW LEVEL SECURITY;
-- crm_seguros (CRM de origen) recibe DML en seguros por privilegios por defecto: se le quita explícitamente.
REVOKE ALL ON seguros.codeoscopic_catalogo FROM PUBLIC, anon, authenticated, crm_seguros;
REVOKE ALL ON seguros.codeoscopic_catalogo FROM prisma_seguros;
GRANT SELECT, INSERT ON seguros.codeoscopic_catalogo TO prisma_seguros;

COMMIT;

-- ─── Comprobación tras aplicar ────────────────────────────────────────────────
--   select to_regclass('seguros.codeoscopic_catalogo');                                    -- no nulo
--   select privilege_type from information_schema.role_table_grants
--    where table_schema = 'seguros' and table_name = 'codeoscopic_catalogo' and grantee = 'prisma_seguros';  -- SELECT, INSERT
--
-- ─── ROLLBACK (las instantáneas se pierden; se rehacen gratis con accion=catalogo_avant2) ─────
--   BEGIN;
--   DROP TABLE IF EXISTS seguros.codeoscopic_catalogo;
--   COMMIT;
