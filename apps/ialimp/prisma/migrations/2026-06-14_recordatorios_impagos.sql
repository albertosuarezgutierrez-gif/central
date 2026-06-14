-- Agente de impagos (ialimp) — histórico de recordatorios enviados, para no
-- repetir el mismo escalón a la misma factura. Tabla ADITIVA, no toca datos.
-- BD compartida: RLS ON sin policies (mismo patrón que facturas_clientes/clientes
-- → el rol de Prisma la usa; la anon key de sivra queda bloqueada).
CREATE TABLE IF NOT EXISTS recordatorios_impagos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  factura_id    uuid NOT NULL,
  cliente_id    uuid NOT NULL,
  escalon       int  NOT NULL,                 -- 1=amable, 2=segundo aviso, 3=último
  email_destino text,
  resultado     text NOT NULL DEFAULT 'enviado',
  enviado_at    timestamptz NOT NULL DEFAULT now()
);

-- Un único recordatorio por (factura, escalón) → idempotencia del cron.
CREATE UNIQUE INDEX IF NOT EXISTS ux_recordatorios_impagos_factura_escalon
  ON recordatorios_impagos (factura_id, escalon);

CREATE INDEX IF NOT EXISTS ix_recordatorios_impagos_empresa
  ON recordatorios_impagos (empresa_id);

ALTER TABLE recordatorios_impagos ENABLE ROW LEVEL SECURITY;
