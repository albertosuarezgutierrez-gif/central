-- Portal de Grupo ASegura — avisos por Web Push (12/09/2026).
--
-- El correo de vencimiento (`apps/asegura` → `/api/cron/avisos-vencimiento`) necesita el email en
-- CLARO, y el portal solo guarda hashes (`portal_canal.valor_hash`) — por eso vive en la otra app.
-- El push NO tiene ese problema: la suscripción del navegador (`endpoint`+claves) no es un dato
-- personal descifrable, así que puede vivir aquí, atada directamente a `portal_identidad`.
--
-- Sello INDEPENDIENTE del correo (`avisada_push_at`, no `avisada_at`): son dos canales que pueden
-- fallar por separado (sin suscripción, endpoint muerto, sin proveedor de correo…) y compartir un
-- sello haría que el fallo de uno tapara el envío del otro.
SET search_path = seguros, public;

ALTER TABLE seguros.portal_obligacion ADD COLUMN IF NOT EXISTS avisada_push_at timestamptz;

CREATE TABLE IF NOT EXISTS seguros.portal_push_suscripcion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth_key     text NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_push_suscripcion_identidad ON seguros.portal_push_suscripcion (identidad_id);

GRANT SELECT, INSERT, DELETE ON seguros.portal_push_suscripcion TO prisma_asegura_portal;
