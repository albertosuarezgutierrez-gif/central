-- 2026-07-10 — Limpieza de reservas CANCELADAS fantasma en `incomes` + backfill de `nights`.
--
-- Contexto: el sync de Smoobu (apps/plataforma/lib/sivra/smoobu-sync.ts) borraba el income al
-- ver una reserva con type='cancellation', PERO el listado /api/reservations de Smoobu OCULTA las
-- canceladas salvo que se pase `showCancellation=1` — flag que `fetchPage` no ponía. Resultado: la
-- rama de borrado nunca se ejecutaba y cada cancelación dejaba un registro fantasma en `incomes`
-- (calendario e ingresos inflados). El fix de código añade `showCancellation=1` para futuras
-- cancelaciones; este SQL limpia las que ya quedaron colgadas.
--
-- (1) Borrado de los 9 fantasmas con llegada 2026–2027, verificados como type='cancellation'
--     contra la API de Smoobu (GET /api/reservations/{id}). NO reproducible por SQL puro: el
--     estado de cancelación vive en Smoobu, por eso se listan los reservationId concretos.
DELETE FROM incomes
WHERE "reservationId" IN (
  '134250232',  -- Mirian El Hataf Mahillo · Luxury Busto · 17-19/07/2026 · Booking
  '141377382',  -- Miriam Conesa García     · Busto Reform · 17-19/07/2026 · Booking
  '141417612',  -- Gabriela Encheva         · House Sevillana · 17-19/07/2026 · Booking
  '141026527',  -- Juan Gabriel Gutierrez   · Luxury Busto · 24-26/07/2026 · Booking
  '144493471',  -- Rosana Castejon          · Busto Reform · 01-08/09/2026 · Booking
  '144899511',  -- Diego Muiño              · House Sevillana · 09-11/10/2026 · Booking
  '144860521',  -- François AMOROZ          · Busto Reform · 11-18/10/2026 · Booking
  '145943691',  -- Javier Espinosa          · House Sevillana · 23-25/10/2026 · Airbnb
  '144516386'   -- Lorena Sosa              · Busto Reform · 10-13/04/2027 · Booking
);

-- (2) Backfill idempotente de `nights` en las reservas ACTIVAS que quedaron con 0/NULL pese a tener
--     fechas válidas (bug histórico: nights no se calculó al insertar). Solo recalcula un valor
--     DERIVADO de checkIn/checkOut; no toca importes.
UPDATE incomes
SET nights = round(EXTRACT(EPOCH FROM ("checkOut" - "checkIn")) / 86400.0)::int
WHERE (nights IS NULL OR nights = 0)
  AND "checkIn" IS NOT NULL AND "checkOut" IS NOT NULL
  AND "checkOut" > "checkIn";
