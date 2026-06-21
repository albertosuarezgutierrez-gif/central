-- QR · Avisos al cliente "pedido listo"
-- Capa 1 (aviso en la propia página) NO necesita tabla: el cliente lo detecta por
-- polling del estado de su comanda. Esta tabla guarda solo los canales que hay que
-- DISPARAR DESDE SERVIDOR cuando la comanda pasa a 'lista':
--   · web_push  → notificación push aunque el cliente cierre la pestaña
--   · whatsapp  → ENCHUFABLE: se activa cuando hay credenciales WhatsApp en env
--
-- El cliente nunca toca esta tabla directamente: siempre vía API route server-side
-- (service role) que valida la sesión QR antes de insertar.

CREATE TABLE IF NOT EXISTS qr_avisos_suscripciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  UUID NOT NULL,
  sesion_id       UUID NOT NULL,
  comanda_id      UUID,                              -- comanda concreta a vigilar
  mesa_id         UUID,
  token           TEXT,                              -- qr_token de la mesa (enlace /q/[token])
  canal           TEXT NOT NULL DEFAULT 'web_push',  -- 'web_push' | 'whatsapp'
  subscription    TEXT,                              -- JSON PushSubscription (canal web_push)
  destino         TEXT,                              -- teléfono E.164 (canal whatsapp)
  notificado      BOOLEAN NOT NULL DEFAULT false,
  notificado_en   TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_avisos_comanda
  ON qr_avisos_suscripciones(comanda_id) WHERE notificado = false;
CREATE INDEX IF NOT EXISTS idx_qr_avisos_restaurante
  ON qr_avisos_suscripciones(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_qr_avisos_sesion
  ON qr_avisos_suscripciones(sesion_id);

ALTER TABLE qr_avisos_suscripciones ENABLE ROW LEVEL SECURITY;

-- Solo service role (API routes server-side / Edge Functions). El cliente accede
-- siempre a través de una API route con validación de sesión, nunca directo.
DROP POLICY IF EXISTS "service_role_all" ON qr_avisos_suscripciones;
CREATE POLICY "service_role_all" ON qr_avisos_suscripciones
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
