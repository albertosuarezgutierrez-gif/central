-- 🌱 Cantera capa C — espejo de BAJA: el radar propone quitar de la watchlist los capa C que
-- llevan ≥4 lunes fuera de su top-20 (botones wlc_baja/wlc_mantener; decide Alberto).
-- baja_decision NULL = pendiente | 'baja' (activo=false en trading_watchlist) | 'mantener' (no re-proponer).
ALTER TABLE trading_cantera
  ADD COLUMN IF NOT EXISTS baja_propuesta_at timestamptz,
  ADD COLUMN IF NOT EXISTS baja_decision text,
  ADD COLUMN IF NOT EXISTS baja_decidida_at timestamptz;
