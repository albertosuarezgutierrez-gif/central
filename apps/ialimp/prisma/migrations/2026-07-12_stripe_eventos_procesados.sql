-- Dedup idempotente del webhook de Stripe (ialimp). Un reenvío del mismo evento
-- (mismo event.id) NO debe aplicar los efectos dos veces (p.ej. doble UPDATE de
-- plan). El webhook inserta `event.id` con ON CONFLICT DO NOTHING antes de
-- procesar; si ya existía, responde 200 sin re-procesar. Tabla ADITIVA.
-- BD compartida: RLS ON sin policies (mismo patrón que recordatorios_impagos
-- → el rol de Prisma la usa; la anon key de sivra queda bloqueada).
CREATE TABLE IF NOT EXISTS stripe_eventos_procesados (
  event_id     text PRIMARY KEY,
  procesado_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stripe_eventos_procesados ENABLE ROW LEVEL SECURITY;
