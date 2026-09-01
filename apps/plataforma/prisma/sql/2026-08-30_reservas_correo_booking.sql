-- Vigía de reservas de Booking por correo (30/08/2026). Registra los avisos de Booking al
-- propietario (⚠️ reserva/cancelación NO registrada por el channel manager, confirmaciones si
-- reaparecen) y los nº de confirmación de mensajes de huésped que Smoobu no reconoce, para que
-- el cron `reservas-booking/verificar` los contraste contra Smoobu y avise si hay agujero.
-- Caso fundacional: James Ascott, Luxury 27→29/08/2026 — Smoobu se cayó, la reserva nunca llegó
-- a `incomes` y la limpieza del 29 no salió en el calendario de Vanesa.
--
-- Semántica de estado (tres estados, nunca dos):
--   'pendiente'  = visto en el correo, aún sin veredicto (o Smoobu incontactable: no se decide).
--   'confirmada' = comprobado y OK (nueva: Smoobu la tiene · cancelación: Smoobu ya no la tiene).
--   'huerfana'   = comprobado y MAL (nueva: Smoobu no la tiene · cancelación: sigue viva).
-- ref/check_in/property_id en NULL = «el correo no lo publicó / no se supo leer», nunca 0/''.

CREATE TABLE IF NOT EXISTS reservas_correo_booking (
  id BIGSERIAL PRIMARY KEY,
  gmail_message_id TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nueva',           -- 'nueva' | 'cancelacion'
  origen TEXT NOT NULL DEFAULT 'aviso_booking', -- 'aviso_booking' | 'mensaje_huesped'
  ref_booking TEXT,
  property_id TEXT,
  nombre_piso TEXT,
  check_in DATE,
  asunto TEXT,
  visto_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado TEXT NOT NULL DEFAULT 'pendiente',
  ultima_comprobacion_at TIMESTAMPTZ,
  confirmada_at TIMESTAMPTZ,
  sync_forzado_at TIMESTAMPTZ,
  avisada_at TIMESTAMPTZ,
  resuelta_avisada_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rcb_estado ON reservas_correo_booking (estado, visto_at DESC);
