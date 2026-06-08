-- ════════════════════════════════════════════════════════════════
-- MESA RÁPIDA + CONFIG RESERVAS · ia.rest · 2026-05-14
-- ════════════════════════════════════════════════════════════════

-- ─── 1. Alias y teléfono de cliente en comandas ────────────────
-- El alias es temporal: desaparece al cerrar la comanda.
-- El número de mesa SIEMPRE se mantiene en mesas.codigo.
ALTER TABLE comandas
  ADD COLUMN IF NOT EXISTS alias_cliente    TEXT,
  ADD COLUMN IF NOT EXISTS telefono_cliente TEXT;

COMMENT ON COLUMN comandas.alias_cliente    IS 'Nombre del cliente para esta comanda (ej: Alberto Suárez). Temporal, solo visible en sala/gestión.';
COMMENT ON COLUMN comandas.telefono_cliente IS 'Teléfono del cliente para esta comanda. Temporal.';

-- ─── 2. Configuración de tiempos de reserva en restaurantes ───
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS reserva_bloqueo_previo_min INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS reserva_tiempo_gracia_min  INTEGER NOT NULL DEFAULT 15;

COMMENT ON COLUMN restaurantes.reserva_bloqueo_previo_min IS 'Minutos antes de la hora de reserva en que la mesa queda bloqueada para camareros.';
COMMENT ON COLUMN restaurantes.reserva_tiempo_gracia_min  IS 'Minutos tras la hora de reserva sin llegada → estado no_show → mesa liberada.';

-- ─── 3. Función SQL: mesas bloqueadas por reserva en este momento ──
-- Devuelve los mesa_id que tienen reserva activa dentro del plazo de bloqueo.
-- Usada por la API GET /api/owner/mesas para inyectar estado 'reservada'.
CREATE OR REPLACE FUNCTION get_mesas_bloqueadas(p_restaurante_id UUID)
RETURNS TABLE(mesa_id UUID, hora_reserva TIME, nombre_cliente TEXT)
LANGUAGE sql STABLE AS $$
  SELECT
    r.mesa_id,
    r.hora_reserva,
    r.nombre_cliente
  FROM reservas r
  JOIN restaurantes rst ON rst.id = r.restaurante_id
  WHERE r.restaurante_id = p_restaurante_id
    AND r.mesa_id IS NOT NULL
    AND r.estado IN ('pendiente', 'confirmada')
    AND r.fecha_reserva = CURRENT_DATE
    -- La mesa se bloquea desde (hora - bloqueo_previo) hasta (hora + tiempo_gracia)
    AND (r.hora_reserva - (rst.reserva_bloqueo_previo_min || ' minutes')::interval)
          <= CURRENT_TIME
    AND (r.hora_reserva + (rst.reserva_tiempo_gracia_min || ' minutes')::interval)
          >= CURRENT_TIME;
$$;

-- ─── 4. Función SQL: liberar reservas vencidas (no-show) ───────
-- Llamada por el cron cada 5 min desde /api/cron/reservas-noshow
CREATE OR REPLACE FUNCTION liberar_reservas_vencidas()
RETURNS TABLE(reserva_id UUID, restaurante_id UUID, mesa_id UUID, nombre_cliente TEXT)
LANGUAGE sql AS $$
  UPDATE reservas r
  SET estado = 'no_show'
  FROM restaurantes rst
  WHERE rst.id = r.restaurante_id
    AND r.estado IN ('pendiente', 'confirmada')
    AND r.fecha_reserva = CURRENT_DATE
    AND (r.hora_reserva + (rst.reserva_tiempo_gracia_min || ' minutes')::interval)
          < CURRENT_TIME
  RETURNING r.id, r.restaurante_id, r.mesa_id, r.nombre_cliente;
$$;

-- ─── 5. Índice para búsqueda de reservas activas del día ───────
CREATE INDEX IF NOT EXISTS idx_reservas_activas_hoy
  ON reservas(restaurante_id, fecha_reserva, estado)
  WHERE estado IN ('pendiente', 'confirmada');
