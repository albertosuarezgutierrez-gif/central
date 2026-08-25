-- 2026-08-25 — pricing_escaparate: recalcular base_total con la base VIVA en el momento de medir.
--
-- POR QUÉ. La rutina de Booking mide el escaparate a las ~03:40 UTC, pero `base_total` se sumaba
-- del snapshot más reciente (`rate_snapshots`, cron de las 07:00) — es decir, del de AYER a las
-- 07:00, ANTERIOR a las tres pasadas de `apply` de ayer (08:30/14:30/20:30, hasta ±20% de
-- movimiento y más si saltó un premio de evento). El portal enseñaba la base nueva y aquí se
-- apuntaba la vieja: la recta del canal salía con un sesgo sistemático del signo del movimiento
-- del día. Medido el 25/08 (fila id=36, Busto Reform 29/08-01/09): base_total=365€ con base viva
-- 469€ → un «+30% de error» de validación que era nuestra PROPIA subida intradía, no Booking.
-- Con el motor subiendo, la validación cantaba «el portal cobra MÁS de lo que predecimos» en los
-- cuatro pisos y el calibrado se corregía contra un fantasma (recalibrados del 25/08: -3%/-7%/-8%).
--
-- La regla (la misma que ahora aplica el ingest, ver app/api/sivra/mercado/ingest/route.ts):
-- por noche, el último precio APLICADO (`pricing_applied`, dry_run=false, applied_at <= momento de
-- la medición) GANA al snapshot si es del mismo día del snapshot o posterior (el snapshot corre a
-- las 07:00 y las pasadas a las 08:30+); si es anterior, el snapshot ya lo contiene — y además
-- caza los cambios hechos a mano en Smoobu.
--
-- Límite asumido: antes del 23/08 `pricing_applied` anotaba también escrituras que Smoobu rechazó
-- (PR del hallazgo 🔴 nº2 de la auditoría) — un fantasma raro puede colarse en filas de esa era;
-- sigue siendo mucho mejor que una base 21 h vieja en todas.
--
-- Idempotente: recalcula siempre lo mismo; solo escribe cuando el valor cambia.

WITH nueva AS (
  SELECT e.id,
    (SELECT CASE WHEN COUNT(n.precio) = e.noches THEN SUM(n.precio)::int END
     FROM generate_series(e.checkin, e.checkin + (e.noches - 1), INTERVAL '1 day') AS d(dia)
     LEFT JOIN LATERAL (
       SELECT rs.price_pricelabs AS precio, rs.snapshot_date
       FROM rate_snapshots rs
       WHERE rs.property_id = e.property_id AND rs.rate_date = d.dia::date
         AND rs.price_pricelabs IS NOT NULL AND rs.snapshot_date <= e.created_at::date
       ORDER BY rs.snapshot_date DESC LIMIT 1
     ) rs ON true
     LEFT JOIN LATERAL (
       SELECT pa.new_price AS precio
       FROM pricing_applied pa
       WHERE pa.property_id = e.property_id AND pa.rate_date = d.dia::date
         AND pa.dry_run = false AND pa.applied_at <= e.created_at
         AND (rs.snapshot_date IS NULL OR pa.applied_at::date >= rs.snapshot_date)
       ORDER BY pa.applied_at DESC LIMIT 1
     ) ap ON true
     LEFT JOIN LATERAL (SELECT COALESCE(ap.precio, rs.precio) AS precio) n ON true
    ) AS base_total
  FROM pricing_escaparate e
)
UPDATE pricing_escaparate e
SET base_total = nueva.base_total
FROM nueva
WHERE nueva.id = e.id AND nueva.base_total IS DISTINCT FROM e.base_total;
