-- 2026-09-23 — Una sola propuesta VIVA por anulación (revisión del PR #3384).
--
-- La clave `anulacion:<id>:<n>` cuenta las filas previas, así que dos listados simultáneos podían
-- insertar `:1` y `:2` a la vez: dos tarjetas para la misma baja. El índice parcial lo impide en la
-- BD (el INSERT va con `on conflict do nothing`); una fallida/caducada deja sitio a la siguiente.
-- Visto morder el 23/09/2026 en un bloque con limpieza: 23505 con dos pendientes, y entra tras fallida.
--
-- Reversible: DROP INDEX seguros.idx_aprobacion_anulacion_viva.

CREATE UNIQUE INDEX IF NOT EXISTS idx_aprobacion_anulacion_viva
  ON seguros.aprobacion (anulacion_id)
  WHERE anulacion_id IS NOT NULL AND estado IN ('pendiente', 'enviando');
