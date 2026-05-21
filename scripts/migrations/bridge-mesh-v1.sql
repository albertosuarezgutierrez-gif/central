-- ═══════════════════════════════════════════════════════════════
-- ia.rest · Bridge Mesh v1 — Arquitectura multi-nodo
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE bridge_tokens
  ADD COLUMN IF NOT EXISTS device_name   TEXT,
  ADD COLUMN IF NOT EXISTS platform      TEXT,
  ADD COLUMN IF NOT EXISTS ip_lan        TEXT,
  ADD COLUMN IF NOT EXISTS en_wifi       BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS rol           TEXT DEFAULT 'standby',
  ADD COLUMN IF NOT EXISTS promovido_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bridge_tokens_master
  ON bridge_tokens(restaurante_id, rol, ultimo_ping)
  WHERE activo = true;

COMMENT ON COLUMN bridge_tokens.rol IS 'master: procesa print_jobs · standby: solo heartbeat';
COMMENT ON COLUMN bridge_tokens.en_wifi IS 'false = dispositivo en datos móviles, no alcanza impresoras LAN';
COMMENT ON COLUMN bridge_tokens.device_name IS 'Nombre del dispositivo: Móvil Ana, Tablet Barra, PC Local...';
