-- 2026-08-15 — El Sevilla-Rayo estaba CONFIRMADO en dos fechas (15 y 16/08); el partido es UNO.
--
-- El websearch de eventos creó la fila del 16/08 el 27/07 y la del 15/08 el 03/08, ambas
-- auto-confirmadas con factor 1,35 y sin evidencia. Fecha real verificada (web oficial Sevilla FC
-- + prensa deportiva): sábado 15/08/2026, 21:30, Ramón Sánchez-Pizjuán → la del 16/08 se descarta.
-- `decidido_por='alberto'` para que el cron verificador no la resucite (revisión de esta sesión
-- con su OK). Un partido nocturno afecta a la noche del día del partido, no a la siguiente.
--
-- Idempotente. APLICADA por Supabase MCP el 15/08/2026.

UPDATE pricing_eventos_auto
SET estado = 'descartado', decidido_por = 'alberto', updated_at = NOW()
WHERE rate_date = '2026-08-16'
  AND nombre = 'Sevilla FC vs Rayo Vallecano'
  AND estado <> 'descartado';
