-- ia.rest · Chat de soporte con IA
-- Tabla soporte_tickets: cada conversación de soporte de un restaurante
-- Tabla soporte_mensajes: mensajes dentro de cada ticket

-- ── soporte_tickets ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS soporte_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  asunto       TEXT,                          -- resumen automático del primer mensaje
  estado       TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','resuelto','escalado')),
  resuelto_por TEXT,                          -- 'ia' | 'alberto' | 'auto'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soporte_tickets_restaurante
  ON soporte_tickets(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_soporte_tickets_estado
  ON soporte_tickets(estado, created_at DESC);

-- ── soporte_mensajes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS soporte_mensajes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES soporte_tickets(id) ON DELETE CASCADE,
  restaurante_id UUID NOT NULL,               -- desnormalizado para RLS
  rol          TEXT NOT NULL CHECK (rol IN ('usuario','ia','alberto')),
  texto        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soporte_mensajes_ticket
  ON soporte_mensajes(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_soporte_mensajes_restaurante
  ON soporte_mensajes(restaurante_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE soporte_tickets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE soporte_mensajes  ENABLE ROW LEVEL SECURITY;

-- Service role puede todo (API routes y Edge Functions)
CREATE POLICY "service_all_tickets"  ON soporte_tickets  USING (auth.role() = 'service_role');
CREATE POLICY "service_all_mensajes" ON soporte_mensajes USING (auth.role() = 'service_role');

-- ── Trigger: updated_at automático en tickets ─────────────────────────────────
CREATE OR REPLACE FUNCTION touch_soporte_ticket()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE soporte_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_soporte_ticket ON soporte_mensajes;
CREATE TRIGGER trg_touch_soporte_ticket
  AFTER INSERT ON soporte_mensajes
  FOR EACH ROW EXECUTE FUNCTION touch_soporte_ticket();
