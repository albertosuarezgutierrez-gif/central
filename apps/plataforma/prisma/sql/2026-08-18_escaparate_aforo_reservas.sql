-- Tres huecos que destapó la reserva de House Sevillana 21-25/12/2026 (18/08/2026).
--
-- 1. `incomes` no guardaba CUÁNTA GENTE venía en cada reserva. Sin ese dato, «¿vendimos barato?»
--    no se puede responder: Booking cobra un recargo por persona por encima de 6 (medido ese día
--    con el conector: 12 huéspedes 1.531,80€/noche vs ≤6 1.384,62€/noche para el 26-28/12), así
--    que el mismo €/noche significa cosas distintas según el grupo. Nullable A PROPÓSITO: NULL =
--    «no lo sabemos» (todo el histórico anterior), 0 no es un aforo.
--
-- 2. No se medía NUESTRO PROPIO ESCAPARATE. El motor convierte mercado→base dividiendo por
--    `pricing_settings.channel_markup` (hoy 1,20 = «el canal Booking lleva +20%»), pero eso es una
--    SUPOSICIÓN sobre lo que ve el huésped, y nadie la había contrastado nunca. Medido el
--    18/08/2026 para House (26-28/12, libre): base Smoobu 1.393,50€/noche, escaparate real 12
--    huéspedes 1.531,80€ (×1,10) y ≤6 huéspedes 1.384,62€ (×0,99). Si el markup configurado es
--    mayor que el real, el motor lista SISTEMÁTICAMENTE por debajo del mercado que él mismo mide
--    —el mismo fallo del ÷1,16 del 09/08/2026, pero ahora medible—. Esta tabla es la serie de esa
--    medición; la escribe `/api/sivra/mercado/ingest` cuando la rutina de Booking se topa con
--    nuestro propio anuncio (que como comparable se descarta, ver lib/sivra/mercado-propios.ts:
--    seguía siendo un dato bueno tirado a la basura).
--
-- 3. `rate_snapshots` tiene DOS columnas de precio con los nombres cambiados, y ya han engañado
--    dos veces (27/07/2026, falsa alarma de Luxury; 18/08/2026, este mismo análisis leyó Navidad a
--    334-462€ cuando el precio real era 860-1.582€). El aviso vivía solo en un comentario de
--    TypeScript, así que no protegía a quien consulta la BD directamente —que es como se cometió
--    el error las dos veces—. Ahora va en el esquema, más una vista con los nombres honestos.

-- ── 1. Aforo real de cada reserva ────────────────────────────────────────────────────────────
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS adults   smallint;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS children smallint;

COMMENT ON COLUMN incomes.adults IS
  'Adultos de la reserva según Smoobu. NULL = no medido (histórico anterior al 18/08/2026 o canal que no lo informa), NUNCA 0 por defecto: un aforo desconocido no es un aforo vacío.';
COMMENT ON COLUMN incomes.children IS
  'Niños de la reserva según Smoobu. NULL = no medido (ver incomes.adults).';

-- ── 2. Nuestro escaparate medido en el portal ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_escaparate (
  id            bigserial PRIMARY KEY,
  property_id   text        NOT NULL,
  rate_date     date        NOT NULL,
  guests        integer     NOT NULL,
  price_night   integer     NOT NULL,
  portal        text        NOT NULL DEFAULT 'booking',
  fuente        text        NOT NULL DEFAULT 'booking_mcp',
  medido_el     date        NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_escaparate_precio_positivo CHECK (price_night > 0),
  CONSTRAINT pricing_escaparate_aforo_positivo  CHECK (guests > 0),
  CONSTRAINT pricing_escaparate_unica UNIQUE (property_id, rate_date, guests, portal, medido_el)
);

COMMENT ON TABLE pricing_escaparate IS
  'Precio que el HUÉSPED ve en el portal para NUESTRO propio anuncio (no es un comparable de mercado: es el espejo). Cruzada con el precio base de rate_snapshots da el markup REAL del canal, que es lo que el motor supone en pricing_settings.channel_markup.';
COMMENT ON COLUMN pricing_escaparate.guests IS
  'Aforo con el que se consultó. Importa: Booking recarga por persona a partir de cierto umbral, así que el markup solo se puede comparar a igualdad de aforo (se usa el aforo MÁXIMO del piso como referencia).';
COMMENT ON COLUMN pricing_escaparate.medido_el IS
  'Día de la medición. Una fila por piso×fecha×aforo×portal y día: la serie deja ver si el markup cambia cuando se toca el ajuste del canal en Smoobu.';

CREATE INDEX IF NOT EXISTS pricing_escaparate_piso_fecha_idx
  ON pricing_escaparate (property_id, rate_date, medido_el DESC);

REVOKE ALL ON pricing_escaparate FROM anon, authenticated;
REVOKE ALL ON SEQUENCE pricing_escaparate_id_seq FROM anon, authenticated;

-- ── 3. Los nombres de rate_snapshots, dichos en el propio esquema ────────────────────────────
COMMENT ON COLUMN rate_snapshots.price_pricelabs IS
  '🚨 ES EL PRECIO REAL VIVO EN SMOOBU (lo que el motor aplicó), pese al nombre. El nombre es de cuando PriceLabs escribía los precios (desconectado el 10/08/2026). Para diagnosticar pricing en vivo, USA ESTA columna (o pricing_applied.new_price).';
COMMENT ON COLUMN rate_snapshots.price_ours IS
  '🚨 NO ES NUESTRO PRECIO. Fórmula estática LEGACY (base fija × estacional × día de la semana, calcOurs de lib/pricing-calendar.ts) anterior al motor anclado al mercado; solo se conserva como referencia sombra. Leerla creyendo que es el precio vivo ya causó una falsa alarma (27/07/2026) y un diagnóstico equivocado de la Navidad de 2026 (18/08/2026). Usa price_pricelabs.';

CREATE OR REPLACE VIEW v_precio_vivo AS
  SELECT property_id,
         rate_date,
         snapshot_date,
         price_pricelabs AS precio_aplicado,
         price_ours      AS precio_sombra_legacy,
         available,
         min_stay,
         was_booked
  FROM rate_snapshots;

COMMENT ON VIEW v_precio_vivo IS
  'rate_snapshots con los nombres que de verdad significan: precio_aplicado = lo que está vivo en Smoobu; precio_sombra_legacy = la fórmula estática vieja. Consulta ESTA vista en vez de la tabla cuando quieras saber a cuánto está una noche.';

REVOKE ALL ON v_precio_vivo FROM anon, authenticated;
