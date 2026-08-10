-- 2026-08-10 — De dónde salió el factor de demanda de cada fecha tarificada.
--
-- POR QUÉ. `pricing/apply` decide el factor de demanda de cada fecha con `factorDemandaFecha`
-- (lib/sivra/pricing-demanda.ts): la ocupación DEL MES si la ventana de venta de esa fecha es
-- juzgable, y la ocupación anual del piso si no. Esa decisión viajaba SOLO en la respuesta HTTP del
-- endpoint, que nadie guarda — así que en cuanto la pasada terminaba, se perdía.
--
-- El agujero real: la consulta de ocupación por mes lleva un `.catch(() => [])`. Si falla (pooler,
-- permisos, timeout), TODAS las fechas caen al factor global y la pasada aplica precios más bajos
-- sin un solo error en los logs. Un fallo así es indistinguible de un funcionamiento correcto:
-- exactamente el «dato que NO hay ≠ dato que NO se ha mirado» del CLAUDE.md raíz, aplicado a nuestra
-- propia telemetría. Se detectó el 09/08/2026 al intentar verificar el PR #1323 en producción y
-- descubrir que la comprobación diseñada para cazar ese fallo NO era observable.
--
-- `demanda_fuente`  = 'mes' | 'global'  (de dónde salió la ocupación que movió la palanca)
-- `demanda_gateada` = true si el descuento se neutralizó porque la fecha aún no se vende
--
-- Ambas admiten NULL a propósito: las filas anteriores a esta migración no lo saben, y NULL es la
-- forma honesta de decirlo. No las rellenamos con un valor por defecto — sería inventar el dato que
-- esta migración existe para poder medir.
ALTER TABLE pricing_applied
  ADD COLUMN IF NOT EXISTS demanda_fuente  TEXT,
  ADD COLUMN IF NOT EXISTS demanda_gateada BOOLEAN;

COMMENT ON COLUMN pricing_applied.demanda_fuente IS
  'De dónde salió la ocupación del factor de demanda: mes | global. NULL = pasada anterior al 10/08/2026.';
COMMENT ON COLUMN pricing_applied.demanda_gateada IS
  'true = el descuento por ocupación se neutralizó (la fecha aún no entró en su ventana de venta).';
