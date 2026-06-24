-- Fase 3 del plan "más fuentes de datos para pricing": señal de demanda por vuelos a SVQ.
-- ADITIVO y seguro para la BD compartida (ialimp no toca estas tablas).
--
-- 1) Índice de demanda por fecha de llegada a Sevilla (SVQ). demand_index ≥ 1.0:
--    1.0 = normal, >1.0 = pico de vuelos/precio entrante → más demanda de alojamiento.
--    Lo puebla el agente de pricing en sesión (Expedia MCP) o un cron con API de vuelos
--    free-tier, vía POST /api/sivra/mercado/flights.
CREATE TABLE IF NOT EXISTS pricing_flight_demand (
  rate_date    date PRIMARY KEY,
  demand_index numeric NOT NULL DEFAULT 1.0,
  fares_sample integer,            -- nº de tarifas muestreadas
  median_fare  numeric,            -- mediana del precio entrante (EUR) ese día
  raw          jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 2) Peso del factor por piso (0 = desactivado, comportamiento idéntico al actual).
--    El motor solo aplica el factor si flight_demand_k > 0 Y hay fila en pricing_flight_demand.
ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS flight_demand_k numeric NOT NULL DEFAULT 0;
