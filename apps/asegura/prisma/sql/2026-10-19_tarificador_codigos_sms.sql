-- RELEVO DEL CÓDIGO SMS por Telegram (19/10/2026, Generali/Okta). Decisión de Alberto: cuando Okta pide el SMS, el bot se lo
-- pide por Telegram, él contesta con el código y el bot verifica marcando «No volver a solicitar en este dispositivo en 30 días».
-- Ver services/tarificador-rpa/src/relevo-sms.ts, apps/asegura/lib/tarificador-codigo-sms*.ts y las rutas
-- POST /api/tarificador/codigo-sms · GET /api/tarificador/codigo-sms/[trabajo] · GET|POST /api/operador/tarificador/codigo-sms.
--
-- ⚠️ El CÓDIGO va antes que este SQL: sin la tabla, las rutas contestan 503 `codigo_sms_sin_activar` y el worker acaba
--    `requiere_humano` como hasta hoy (no se manda ningún SMS: la petición se apunta ANTES de pulsar «Enviar»).
-- 🔒 `codigo_sellado` es OPACO: el código sellado (X25519 + AES-256-GCM) con la clave pública que el worker generó EN MEMORIA
--    para su trabajo. Ni asegura, ni Vercel, ni esta BD pueden abrirlo. Se anula al recogerlo (un uso) y al caducar (10 min).
--    `clave_publica` NO es secreta. No hay columna para el código en claro, ni la habrá.
-- 🛡️ Solo `prisma_seguros` (BYPASSRLS; la app filtra por correduria_id). RLS activada SIN políticas: cerrada a cualquier otro rol.
--
-- Idempotente (IF NOT EXISTS). Se deshace con:  DROP TABLE seguros.tarificador_codigos_sms;
BEGIN;

SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.tarificador_codigos_sms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  -- Una petición por trabajo (un worker que vuelve a pedir la REABRE: otro SMS, otro aviso).
  trabajo_id      uuid NOT NULL UNIQUE REFERENCES seguros.tarificacion_trabajos (id) ON DELETE CASCADE,
  compania        text NOT NULL CHECK (compania ~ '^[a-z0-9-]{1,40}$'),
  ramo            text NOT NULL CHECK (length(ramo) BETWEEN 1 AND 40),
  -- X25519 cruda (32 bytes) en base64url.
  clave_publica   text NOT NULL CHECK (clave_publica ~ '^[A-Za-z0-9_-]{43}$'),
  pedido_en       timestamptz NOT NULL DEFAULT now(),
  caduca_en       timestamptz NOT NULL,
  avisado_en      timestamptz,
  respondido_en   timestamptz,
  recogido_en     timestamptz,
  -- `c1.<pública efímera>.<iv>.<cifrado+tag>`; NULL salvo entre la respuesta de Alberto y la recogida del worker.
  codigo_sellado  text CHECK (codigo_sellado IS NULL OR codigo_sellado ~ '^c1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{27,40}$'),
  CONSTRAINT tarificador_codigos_sms_caduca CHECK (caduca_en > pedido_en AND caduca_en <= pedido_en + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS tarificador_codigos_sms_abiertas
  ON seguros.tarificador_codigos_sms (correduria_id, pedido_en)
  WHERE respondido_en IS NULL;

COMMENT ON TABLE seguros.tarificador_codigos_sms IS
  'Peticiones del código SMS de un portal (Okta de Generali) relevado por Telegram. El código solo se guarda SELLADO para la '
  'clave pública efímera del worker (no se puede abrir aquí), un uso y 10 min. Sin datos del cliente ni del riesgo.';

ALTER TABLE seguros.tarificador_codigos_sms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_codigos_sms FROM PUBLIC, anon, authenticated, crm_seguros;
DO $portal$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_asegura_portal') THEN
    EXECUTE 'REVOKE ALL ON seguros.tarificador_codigos_sms FROM prisma_asegura_portal';
  END IF;
END
$portal$;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.tarificador_codigos_sms TO prisma_seguros;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON seguros.tarificador_codigos_sms FROM prisma_seguros;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar:
--   select count(*) from seguros.tarificador_codigos_sms;   -- 0
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'tarificador_codigos_sms' order by 1, 2;   -- solo prisma_seguros: DELETE, INSERT, SELECT, UPDATE
-- ⚠️ Para RECORDAR el dispositivo 30 días hace falta además la bóveda: 2026-10-07e_tarificador_sesiones.sql aplicado y el
--    fly secret TARIFICADOR_SESION_KEY (32 bytes base64). Sin ellos el relevo funciona, pero Okta pedirá el SMS en cada trabajo.
-- ════════════════════════════════════════════════════════════════════════════
