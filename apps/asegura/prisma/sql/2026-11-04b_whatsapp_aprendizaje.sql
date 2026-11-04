-- 2026-11-04b — WhatsApp de Grupo ASegura: APRENDIZAJE y AUTONOMÍA GRADUAL de las propuestas (fecha_cobro/pagado/vencimiento).
-- Spec: docs/superpowers/specs/2026-11-04-whatsapp-correduria-respuestas-crm.md § «Aprendizaje y autonomía».
-- Código: apps/asegura/lib/whatsapp/{aprendizaje-reglas,aprendizaje,propuestas,analizar,retencion}.ts.
-- Requiere 2026-11-04_whatsapp_respuestas_crm.sql (FK a whatsapp_propuestas).
--
-- Qué añade (TODO aditivo, idempotente, nada heredado cambia):
--   seguros.whatsapp_aprendizaje — UNA fila por propuesta: el contexto con el que se propuso (tipo, origen del saliente
--   vinculado, extracto REDACTADO del último mensaje del cliente) y cómo la resolvió Alberto (aplicada / descartada /
--   modificada, con la versión propuesta y la final), o si se aplicó SOLA (autonoma) y si luego se deshizo.
--   De aquí salen (a) los casos parecidos que se inyectan en el prompt del analizador y (b) la RACHA por tipo que decide
--   la autonomía (calculada, no guardada: no hay contador que se desincronice).
--
-- 🔐 PII: `extracto` y `observacion` se guardan ya pasados por `redactarPii` (DNI, IBAN, teléfonos, emails, matrículas,
--    nombre del contacto) y recortados a 300. Se ANULAN con la conversación: retención (WHATSAPP_RETENCION_DIAS),
--    purga por «personal» y supresión (`retencion.ts`). Ni ids de recibo ni importes: solo fechas y el tipo.
-- 🛡️ Aislamiento: correduria_id en la fila y en toda sentencia (BYPASSRLS).
-- ✅ APLICADA en producción el 04/11/2026 (MCP Supabase, proyecto central, schema seguros). Antes de aplicarla, el código
--    era fail-closed: no registraba (no-op), no inyectaba casos (`casos_previos: null`) y la autonomía no se activaba.
--    La autonomía sigue exigiendo ASEGURA_WHATSAPP_AUTONOMIA_ACTIVA=1 (apagada por defecto).
--
-- Se deshace con:
--   DROP TABLE IF EXISTS seguros.whatsapp_aprendizaje;

BEGIN;

SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.whatsapp_aprendizaje (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id       uuid NOT NULL REFERENCES seguros.corredurias (id),
  propuesta_id        uuid REFERENCES seguros.whatsapp_propuestas (id) ON DELETE SET NULL,
  conversacion_id     uuid REFERENCES seguros.conversaciones (id) ON DELETE SET NULL,
  tipo                text NOT NULL CHECK (tipo IN ('fecha_cobro', 'pagado', 'vencimiento')),
  -- Contexto (sin PII): de qué iba lo último que se le mandó y qué dijo el cliente, redactado.
  origen_saliente     text CHECK (origen_saliente IS NULL OR length(origen_saliente) <= 40),
  extracto            text CHECK (extracto IS NULL OR length(extracto) <= 300),
  -- {fecha?: 'aaaa-mm-dd'}: lo que propuso la IA y lo que quedó aplicado (NULL si se descartó).
  propuesta_original  jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(propuesta_original) = 'object' AND pg_column_size(propuesta_original) <= 500),
  version_final       jsonb CHECK (version_final IS NULL OR (jsonb_typeof(version_final) = 'object' AND pg_column_size(version_final) <= 500)),
  -- La corrección de Alberto (✏️), redactada.
  observacion         text CHECK (observacion IS NULL OR length(observacion) <= 300),
  -- NULL = aún pendiente. 'aplicada' = ✅ sin tocar · 'modificada' = ✏️ · 'descartada' = ❌. Una aplicada SOLA lleva autonoma.
  resolucion          text CHECK (resolucion IS NULL OR resolucion IN ('aplicada', 'descartada', 'modificada')),
  autonoma            boolean NOT NULL DEFAULT false,
  resuelta_at         timestamptz,
  resuelta_por        text CHECK (resuelta_por IS NULL OR length(resuelta_por) <= 120),
  -- ↩️ Deshacer (solo de una autónoma; un uso). Cuenta como reinicio de la racha en la fecha en que se pulsó.
  deshecha_at         timestamptz,
  deshecha_por        text CHECK (deshecha_por IS NULL OR length(deshecha_por) <= 120),
  creada_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aprendizaje_resuelta_coherente CHECK ((resolucion IS NULL) = (resuelta_at IS NULL)),
  CONSTRAINT aprendizaje_autonoma_aplicada CHECK (NOT autonoma OR resolucion = 'aplicada'),
  CONSTRAINT aprendizaje_deshecha_solo_autonoma CHECK (deshecha_at IS NULL OR autonoma)
);

-- Una fila por propuesta (se crea al proponer y se completa al resolver: upsert por aquí).
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_aprendizaje_propuesta
  ON seguros.whatsapp_aprendizaje (propuesta_id) WHERE propuesta_id IS NOT NULL;
-- Racha por tipo (las últimas resoluciones).
CREATE INDEX IF NOT EXISTS idx_wa_aprendizaje_racha
  ON seguros.whatsapp_aprendizaje (correduria_id, tipo, resuelta_at DESC) WHERE resolucion IS NOT NULL;
-- Purga del extracto con la conversación.
CREATE INDEX IF NOT EXISTS idx_wa_aprendizaje_conversacion
  ON seguros.whatsapp_aprendizaje (conversacion_id) WHERE extracto IS NOT NULL;

COMMENT ON TABLE seguros.whatsapp_aprendizaje IS
  'Cómo resolvió el corredor cada propuesta de la IA de WhatsApp (aplicada/descartada/modificada/autónoma/deshecha), con '
  'contexto redactado. Alimenta los casos parecidos del prompt y la racha que da autonomía por tipo. Sin PII en claro.';

-- Permisos (mismo patrón que whatsapp_propuestas): RLS sin policies, nada público. La app no borra filas (el extracto
-- se anula, la fila queda: es la racha).
ALTER TABLE seguros.whatsapp_aprendizaje ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.whatsapp_aprendizaje FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.whatsapp_aprendizaje TO prisma_seguros;
REVOKE DELETE ON seguros.whatsapp_aprendizaje FROM prisma_seguros;

COMMIT;

-- Comprobación tras aplicar:
--   select relname, relrowsecurity from pg_class where oid = 'seguros.whatsapp_aprendizaje'::regclass;
--   select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'seguros' and table_name = 'whatsapp_aprendizaje';
