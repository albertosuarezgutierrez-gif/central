-- Semilla de `pricing_escaparate`: las 16 ventanas medidas a mano el 19/08/2026 con el conector
-- de Booking, una por una, sobre los CUATRO anuncios propios.
--
-- POR QUÉ A MANO Y POR QUÉ AQUÍ. El ajuste del canal (`lib/sivra/pricing-canal.ts`) necesita ≥3
-- ventanas por piso Y aforo, con recorrido de precio suficiente para separar el multiplicador de
-- la cuota fija. La rutina diaria las irá midiendo sola a partir de ahora (ver el plan de
-- escaparate de `/api/sivra/mercado/plan`), pero eso tarda días en acumular; sin esta semilla el
-- motor seguiría dividiendo por el ×1,20 supuesto mientras tanto, que es justo el error que costó
-- dinero en la reserva de Navidad. La medición es de UN día (19/08/2026) para los cuatro pisos, así
-- que la recta describe el canal, no el movimiento del motor entre fechas.
--
-- `base_total` NO se escribe a mano: se calcula aquí sumando `rate_snapshots.price_pricelabs` —que
-- PESE AL NOMBRE es el precio vivo de Smoobu, ver el COMMENT de la columna— de las noches de cada
-- ventana, con el snapshot más cercano al día de la medición. Si a una ventana le falta el precio
-- de alguna noche, `base_total` queda NULL y el ajuste la descarta: un ratio con la base a medias
-- no es un ratio bajo, es un ratio desconocido.

WITH medicion AS (
  SELECT * FROM (VALUES
    -- piso                   checkin       noches guests  precio total del portal (price.book)
    ('prop_house_sevillana', DATE '2026-09-08', 2, 12, 1261.36),
    ('prop_house_sevillana', DATE '2026-09-08', 3, 12, 2045.44),
    ('prop_house_sevillana', DATE '2026-12-26', 2, 12, 3063.60),
    ('prop_house_sevillana', DATE '2026-09-08', 2,  6, 1147.22),
    ('prop_house_sevillana', DATE '2026-09-08', 3,  6, 1679.61),
    ('prop_house_sevillana', DATE '2026-12-26', 2,  6, 2769.24),
    ('prop_busto_reform',    DATE '2026-09-08', 2,  2,  247.25),
    ('prop_busto_reform',    DATE '2026-09-08', 4,  2,  576.79),
    ('prop_busto_reform',    DATE '2026-10-06', 2,  2,  709.27),
    ('prop_busto_reform',    DATE '2026-11-10', 4,  2,  417.82),
    ('prop_duplex_center',   DATE '2026-09-08', 2,  4,  304.28),
    ('prop_duplex_center',   DATE '2026-10-06', 2,  4,  316.95),
    ('prop_duplex_center',   DATE '2026-11-10', 4,  4,  538.71),
    ('prop_luxury_busto',    DATE '2026-09-08', 2,  5,  347.81),
    ('prop_luxury_busto',    DATE '2026-09-08', 4,  5,  825.57),
    ('prop_luxury_busto',    DATE '2026-10-06', 2,  5,  567.23)
  ) AS t(property_id, checkin, noches, guests, precio_total)
)
INSERT INTO pricing_escaparate
  (property_id, checkin, noches, guests, precio_total, base_total, portal, fuente, medido_el)
SELECT m.property_id, m.checkin, m.noches, m.guests, ROUND(m.precio_total)::int,
       b.base_total, 'booking', 'booking_mcp', DATE '2026-08-19'
FROM medicion m
LEFT JOIN LATERAL (
  SELECT CASE WHEN COUNT(noche.precio) = m.noches THEN SUM(noche.precio)::int END AS base_total
  FROM generate_series(m.checkin, m.checkin + (m.noches - 1), INTERVAL '1 day') AS d(dia)
  LEFT JOIN LATERAL (
    SELECT rs.price_pricelabs AS precio
    FROM rate_snapshots rs
    WHERE rs.property_id = m.property_id
      AND rs.rate_date = d.dia::date
      AND rs.price_pricelabs IS NOT NULL
      AND rs.snapshot_date <= DATE '2026-08-19'
    ORDER BY rs.snapshot_date DESC
    LIMIT 1
  ) noche ON true
) b ON true
ON CONFLICT (property_id, checkin, noches, guests, portal, medido_el) DO NOTHING;
