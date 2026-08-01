-- Latidos de syncs (01/08/2026): huella FIABLE por sync — se refresca en CADA pasada que
-- termina bien, haya o no trabajo (regla de oro de lib/monitoring/latidos.ts; `incomes`
-- solo escribe cuando entra una reserva nueva → no vale como huella). Primer consumidor:
-- el Check 4 del health-check, que ahora distingue "sync averiado" (🔴 fallo real) de
-- "sin reservas nuevas" (informativo — feedback de Alberto 01/08/2026: eso no es un fallo
-- y no debe pintarse como tal; le pasó con la sequía del 25/07→01/08).
-- Aplicar por Supabase MCP en la BD compartida (wswbehlcuxqxyinousql).

CREATE TABLE IF NOT EXISTS sync_latidos (
  clave text PRIMARY KEY,
  ultimo timestamptz NOT NULL DEFAULT now()
);

-- Tabla interna de monitorización: nada que exponer a los roles de la API de Supabase.
REVOKE ALL ON sync_latidos FROM anon, authenticated;

-- Semilla de transición: el sync de Smoobu está verificado corriendo (logs 200 del 31/07 y
-- 01/08); sembrar el latido evita que el health-check pase por la rama "sin latido" entre
-- este deploy y la primera corrida del sync con el código nuevo. Idempotente.
INSERT INTO sync_latidos (clave, ultimo) VALUES ('smoobu', now())
ON CONFLICT (clave) DO NOTHING;
