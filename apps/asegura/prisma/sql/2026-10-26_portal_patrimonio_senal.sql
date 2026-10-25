-- Patrimonio — SEÑALES para la cola «Patrimonio» de /correduria (P16, 26/10/2026).
-- ⏳ SIN APLICAR. El motor está construido y APAGADO (`PATRIMONIO_SENALES_ACTIVAS`, por defecto apagado): sin esta tabla el
-- cron responde `apagado` sin tocar la BD, y la cola de plataforma dice que el motor está apagado. Se aplica ANTES de
-- encender el interruptor (con el interruptor apagado la tabla no se lee ni se escribe).
-- Requiere `apps/asegura-portal/prisma/sql/2026-10-22_portal_patrimonio.sql` ya aplicado (titular, inmueble, contrato) y
-- `seguros.portal_poliza_declarada` y `seguros.oportunidades`. IDEMPOTENTE y ADITIVA: ninguna sentencia de borrado de
-- objetos (el MCP de Supabase se cuelga con ellas), ni siquiera en comentarios.
--
-- ── Qué es ────────────────────────────────────────────────────────────────────
--  · Una SEÑAL es un hecho calculado («el inmueble X de la ficha F no tiene seguro»). La crea el cron de `apps/asegura`, la ve
--    solo Alberto en `/correduria` → Gestión → «Patrimonio». NO es una oportunidad ni autoriza contacto alguno.
--  · Sin GRANT al portal (el cliente ve su estado en vivo, no la señal) y `REVOKE ALL … FROM crm_seguros` (el CRM de Manuel no
--    lee patrimonio). La lee y escribe `prisma_seguros` (BYPASSRLS) desde `apps/asegura`.
--  · `datos` jsonb: SOLO alias del inmueble y cifras del riesgo (ratio, faltante, vencimiento). Ni PII ni rentas ni nada del
--    inquilino (cepo `test/regression-portal-patrimonio-senales.test.ts`).
--  · Una por clave viva (`<ficha>:<objeto>:<tipo>`); las cerradas se acumulan (la más reciente decide los 180 días tras un
--    descarte, `DIAS_TRAS_DESCARTE` de `@central/module-patrimonio`).
--  · `inmueble_id`/`titular_id` pueden ser NULL solo en `poliza_externa_por_vencer` (cuelga de una declarada de la identidad).
--
-- ── PASO MANUAL APARTE (no está en este fichero) ──────────────────────────────
--  El consentimiento `comercial_patrimonio` necesita ensanchar el CHECK de `seguros.portal_consentimiento.tipo` (hoy:
--  avisos, comercial, lds_art19; nombre de la restricción: `portal_consentimiento_tipo_check`, comprobarlo con `\d`). Eso exige
--  sustituir la restricción antigua, con una sentencia de borrado que este repositorio no escribe en ficheros SQL: hacerlo a
--  mano, en una transacción, ANTES de encender el interruptor, dejando la lista: 'avisos', 'comercial', 'lds_art19',
--  'comercial_patrimonio'. (Sin eso, dar la casilla devuelve 500 y el motor no calcula nada: falla cerrado.)
SET search_path = seguros, public;

BEGIN;

CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_senal (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id        uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id           uuid NOT NULL REFERENCES seguros.clientes (id),            -- ficha del TITULAR (su NIF); fusionada → se sigue
  titular_id           uuid REFERENCES seguros.portal_patrimonio_titular (id),
  inmueble_id          uuid REFERENCES seguros.portal_patrimonio_inmueble (id),
  contrato_id          uuid REFERENCES seguros.portal_patrimonio_contrato (id),
  poliza_declarada_id  uuid REFERENCES seguros.portal_poliza_declarada (id),
  tipo                 text NOT NULL,
  ramo                 text NOT NULL,
  prioridad            text NOT NULL DEFAULT 'media',
  objeto               text NOT NULL,                                              -- 'rc:<ref. catastral>' · 'inm:<id>' · 'con:<id>' · 'dec:<id>'
  clave                text NOT NULL,                                              -- '<cliente_id>:<objeto>:<tipo>'
  datos                jsonb NOT NULL DEFAULT '{}'::jsonb,                         -- solo cifras del riesgo y alias; sin PII ni rentas
  estado               text NOT NULL DEFAULT 'abierta',
  oportunidad_id       uuid REFERENCES seguros.oportunidades (id),
  primera_vez_en       timestamptz NOT NULL DEFAULT now(),
  ultima_vez_en        timestamptz NOT NULL DEFAULT now(),
  cerrada_en           timestamptz,
  cerrada_por          text,
  motivo               text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_senal_tipo') THEN
    ALTER TABLE seguros.portal_patrimonio_senal
      ADD CONSTRAINT portal_patrimonio_senal_tipo CHECK (tipo IN
        ('inmueble_sin_seguro', 'infraseguro', 'poliza_externa_por_vencer', 'alquiler_sin_impago', 'hipoteca_con_seguros'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_senal_estado') THEN
    ALTER TABLE seguros.portal_patrimonio_senal
      ADD CONSTRAINT portal_patrimonio_senal_estado CHECK (estado IN ('abierta', 'promovida', 'descartada', 'resuelta', 'retirada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_senal_prioridad') THEN
    ALTER TABLE seguros.portal_patrimonio_senal
      ADD CONSTRAINT portal_patrimonio_senal_prioridad CHECK (prioridad IN ('alta', 'media', 'baja'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_senal_promovida') THEN
    ALTER TABLE seguros.portal_patrimonio_senal
      ADD CONSTRAINT portal_patrimonio_senal_promovida CHECK (estado <> 'promovida' OR oportunidad_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_senal_cierre') THEN
    ALTER TABLE seguros.portal_patrimonio_senal
      ADD CONSTRAINT portal_patrimonio_senal_cierre CHECK ((estado IN ('abierta', 'promovida')) = (cerrada_en IS NULL));
  END IF;
  -- Solo la externa por vencer puede no colgar de un inmueble, y entonces cuelga de una declarada.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_senal_objeto') THEN
    ALTER TABLE seguros.portal_patrimonio_senal
      ADD CONSTRAINT portal_patrimonio_senal_objeto CHECK (
        (tipo = 'poliza_externa_por_vencer' AND poliza_declarada_id IS NOT NULL)
        OR (tipo <> 'poliza_externa_por_vencer' AND inmueble_id IS NOT NULL AND titular_id IS NOT NULL));
  END IF;
END $$;

-- Una señal VIVA por clave (la cerrada no cuenta: una descartada vuelve, pasados los 180 días, como fila nueva).
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_senal_viva
  ON seguros.portal_patrimonio_senal (correduria_id, clave) WHERE estado IN ('abierta', 'promovida');
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_senal_cliente
  ON seguros.portal_patrimonio_senal (correduria_id, cliente_id) WHERE estado IN ('abierta', 'promovida');
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_senal_cerradas
  ON seguros.portal_patrimonio_senal (correduria_id, clave, cerrada_en) WHERE cerrada_en IS NOT NULL;

ALTER TABLE seguros.portal_patrimonio_senal DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.portal_patrimonio_senal FROM crm_seguros;
REVOKE ALL ON seguros.portal_patrimonio_senal FROM prisma_asegura_portal;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'seguros' AND table_name = 'portal_patrimonio_senal'
--   → ni crm_seguros ni prisma_asegura_portal.
