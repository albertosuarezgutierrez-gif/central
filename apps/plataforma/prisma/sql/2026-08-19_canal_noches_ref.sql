-- `noches_ref`: entre cuántas noches se reparte la cuota fija del canal (19/08/2026).
--
-- El modelo afín del canal es `escaparate_total = markup × base_total + cuota_fija`. Para tarifar
-- POR NOCHE hay que repartir esa cuota fija, y repartirla entre 2 noches o entre 5 da precios muy
-- distintos. La duración correcta es con la que de VERDAD se vende ese piso (mediana de
-- `incomes.nights` del último año), no una constante inventada: House se vende a 2 noches y Busto
-- Reform a 3.
--
-- Se persiste en vez de calcularse en cada consulta para que las dos mitades del modelo —cuota y
-- reparto— las escriba SIEMPRE la misma pasada (`/api/sivra/pricing/canal`). Si una se calculara al
-- vuelo y la otra estuviera guardada, podrían describir mundos distintos sin que nada lo delatara.
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS noches_ref integer NOT NULL DEFAULT 2;

COMMENT ON COLUMN pricing_settings.noches_ref IS
  'Noches de la estancia TIPICA del piso (mediana de incomes.nights, ultimo ano). Entre ellas se reparte cuota_fija al convertir mercado->base. Lo escribe /api/sivra/pricing/canal junto con cuota_fija: las dos mitades del modelo van siempre a la vez.';
