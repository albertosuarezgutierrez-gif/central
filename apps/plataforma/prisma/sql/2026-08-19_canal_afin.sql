-- El canal no es un multiplicador: es una recta (19/08/2026).
--
-- Medido con el conector de Booking sobre los CUATRO pisos, el mismo día y a igualdad de aforo,
-- comparando ventanas de distinta duración:
--
--     piso            multiplicador   cuota fija/estancia
--     House            0,835            453,3€   (R² 0,9987 sobre bases de 860€ a 2.787€)
--     Busto Reform     0,955             30,4€
--     Duplex Center    0,953             48,9€
--     Luxury Busto     0,796             56,4€
--
-- `pricing_settings.channel_markup` valía 1,20 para todos y no existía la cuota fija. El motor
-- convierte mercado→base dividiendo por ese número, así que el error viajaba a TODAS las fechas:
-- en una noche de mercado de 1.500€ pedía 1.250€ de base cuando lo correcto son ~1.482€.
--
-- La cuota fija (la limpieza) es lo que hacía imposible medir un «markup» estable: el mismo piso
-- daba ×1,33 en una estancia de 2 noches y ×1,18 en una de 3 sin que hubiera cambiado nada.
-- Por eso `pricing_escaparate` pasa a guardar la VENTANA entera (checkin + noches + aforo +
-- precio total + base total) en vez de un precio por noche: sin la duración, el dato no significa
-- nada. La tabla se rehace entera — nació ayer y solo tenía las 4 filas de la primera medición.

DROP TABLE IF EXISTS pricing_escaparate;

CREATE TABLE pricing_escaparate (
  id           bigserial PRIMARY KEY,
  property_id  text        NOT NULL,
  checkin      date        NOT NULL,
  noches       integer     NOT NULL,
  guests       integer     NOT NULL,
  precio_total integer     NOT NULL,
  base_total   integer,
  portal       text        NOT NULL DEFAULT 'booking',
  fuente       text        NOT NULL DEFAULT 'booking_mcp',
  medido_el    date        NOT NULL DEFAULT CURRENT_DATE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_escaparate_precio_positivo CHECK (precio_total > 0),
  CONSTRAINT pricing_escaparate_noches_positivas CHECK (noches > 0),
  CONSTRAINT pricing_escaparate_aforo_positivo CHECK (guests > 0),
  CONSTRAINT pricing_escaparate_unica UNIQUE (property_id, checkin, noches, guests, portal, medido_el)
);

COMMENT ON TABLE pricing_escaparate IS
  'Precio que el HUESPED ve en el portal para NUESTRO propio anuncio, por VENTANA (no por noche). No es un comparable de mercado: es el espejo. Cruzado con la base de Smoobu de esas mismas noches da la recta escaparate = markup x base + cuota_fija (ver lib/sivra/pricing-canal.ts).';
COMMENT ON COLUMN pricing_escaparate.noches IS
  'Noches de la ventana. IMPRESCINDIBLE: con una cuota fija por estancia, el mismo piso da ratios distintos segun la duracion. Un precio por noche suelto no se puede interpretar.';
COMMENT ON COLUMN pricing_escaparate.base_total IS
  'Suma de la base de Smoobu de esas noches (rate_snapshots.price_pricelabs) el dia de la medicion. NULL = alguna noche sin snapshot: la ventana no se puede usar.';

CREATE INDEX pricing_escaparate_piso_idx ON pricing_escaparate (property_id, medido_el DESC);

REVOKE ALL ON pricing_escaparate FROM anon, authenticated;
REVOKE ALL ON SEQUENCE pricing_escaparate_id_seq FROM anon, authenticated;

-- La otra mitad del modelo, que hasta ahora no existía en ninguna parte.
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS cuota_fija numeric NOT NULL DEFAULT 0;
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS canal_auto boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN pricing_settings.cuota_fija IS
  'Cuota FIJA por estancia que el portal suma al precio (limpieza y demas), en €. Se reparte entre las noches de la estancia tipica del piso al convertir mercado->base. 0 = sin cuota (no es lo mismo que "no medida": lo no medido no se aplica).';
COMMENT ON COLUMN pricing_settings.canal_auto IS
  'true = el cron /api/sivra/pricing/canal puede REESCRIBIR channel_markup y cuota_fija con lo medido en el portal (acotado por pasada). false = solo avisa. Es el interruptor de esa automatizacion.';
COMMENT ON COLUMN pricing_settings.channel_markup IS
  'Multiplicador del canal sobre la base (m de la recta escaparate = m x base + cuota_fija). Medido, NO supuesto: lo escribe el cron del canal desde pricing_escaparate. Ojo, puede ser <1.';
