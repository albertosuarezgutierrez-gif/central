-- Cursor del dispatcher de crons (/api/cron/dispatch): fila única con el último minuto
-- procesado. Permite el catch-up de minutos que el scheduler de Vercel omita (incidente
-- psd2-sync 29/07/2026, PR #1162) y evita el doble disparo si coinciden dos instancias.
-- El endpoint degrada sin esta tabla (procesa solo el minuto actual, sin catch-up).
-- Aplicar por Supabase MCP en la BD compartida (wswbehlcuxqxyinousql), como en mapa_arquitectura.

CREATE TABLE IF NOT EXISTS cron_dispatch_cursor (
  id smallint PRIMARY KEY,
  ultimo_minuto timestamptz NOT NULL
);

-- Tabla interna del dispatcher: nada que exponer a los roles de la API de Supabase.
REVOKE ALL ON cron_dispatch_cursor FROM anon, authenticated;
