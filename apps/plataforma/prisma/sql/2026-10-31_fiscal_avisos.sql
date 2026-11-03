-- Dedupe de los avisos fiscales por Telegram (cron /api/cron/fiscal-avisos): no repetir el mismo aviso
-- (clave + hash del texto) en 7 días; los recordatorios de «una vez» (diciembre) no se repiten en el año.
-- Aditivo. Aplicar por Supabase MCP en la BD compartida (wswbehlcuxqxyinousql). Sin esta tabla el cron
-- sigue avisando (fail-open) pero SIN dedupe.
CREATE TABLE IF NOT EXISTS fiscal_avisos_enviados (
  id         bigserial PRIMARY KEY,
  cuenta_id  uuid NOT NULL,
  clave      text NOT NULL,
  hash       text NOT NULL,
  enviado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_avisos_enviados_idx ON fiscal_avisos_enviados (cuenta_id, clave, enviado_at DESC);
ALTER TABLE fiscal_avisos_enviados ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON fiscal_avisos_enviados TO prisma_plataforma;
GRANT USAGE, SELECT ON SEQUENCE fiscal_avisos_enviados_id_seq TO prisma_plataforma;
REVOKE ALL ON fiscal_avisos_enviados FROM anon, authenticated;
