-- 📒 Libro de OPERACIONES ejecutadas del bróker (Interactive Brokers).
-- La app en Vercel NO habla con IBKR: las ejecuciones las empuja la pasada diaria del agente
-- `trading-analista` (que sí tiene el MCP, solo lectura) vía POST /api/trading/operaciones
-- (Bearer ALERTA_TOKEN/CRON_SECRET). Mismo contrato que /api/trading/cartera.
--
-- Diferencia de naturaleza con trading_cartera_real: aquella es una FOTO que se reemplaza entera
-- en cada pasada. Esto es un LIBRO INMUTABLE: cada ejecución se inserta una vez y no se toca más.
-- Es la fuente del cálculo fiscal español (FIFO por valores homogéneos, regla de los dos meses del
-- art. 33.5.f LIRPF), donde perder o duplicar una línea cambia la renta. De ahí la clave única por
-- (broker, trade_id): reenviar la misma pasada no duplica nada.
--
-- Origen: sesión del 19/08/2026. Se cargaron 455 ejecuciones (oct/2025 – ago/2026) leídas por MCP,
-- con checksums verificados contra el origen (filas, símbolos, P&L, comisiones y volumen).
--
-- BD COMPARTIDA multi-tenant. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- prisma_plataforma es BYPASSRLS → sin políticas RLS. NUNCA exponer por REST/anon.

CREATE TABLE IF NOT EXISTS public.trading_operaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id       uuid NOT NULL,              -- dueño (scope multi-tenant, = cuentas.id)
  broker          text NOT NULL DEFAULT 'Interactive Brokers',
  trade_id        text NOT NULL,              -- id de la ejecución en el bróker (idempotencia)
  order_id        text,                       -- varias ejecuciones comparten orden (venues)
  simbolo         text NOT NULL,
  descripcion     text,
  tipo_activo     text,                       -- 'STK' | 'CASH' | …
  lado            text NOT NULL CHECK (lado IN ('BUY','SELL')),
  cantidad        numeric NOT NULL CHECK (cantidad > 0),
  precio          numeric NOT NULL CHECK (precio >= 0),
  divisa          text NOT NULL,
  comision        numeric NOT NULL DEFAULT 0,
  importe_neto    numeric,
  tipo_orden      text,                       -- 'MARKET' | 'STOP' | 'LIMIT' …
  ejecutado_en    timestamptz NOT NULL,
  fecha           date GENERATED ALWAYS AS (((ejecutado_en AT TIME ZONE 'UTC'))::date) STORED,
  -- Resultado realizado SEGÚN EL BRÓKER (IBKR usa coste medio). NO es el resultado fiscal español,
  -- que exige FIFO por valores homogéneos. Solo sirve para conciliar.
  pnl_broker      numeric,
  -- Unidades de `divisa` por 1 EUR el día de la operación. NULL = TODAVÍA NO SE HA CONSULTADO,
  -- no «1». Nunca colapsar con COALESCE: produciría importes en euros falsos y sin hueco que lo
  -- delate. Para divisa='EUR' vale 1 por definición.
  tipo_cambio     numeric CHECK (tipo_cambio IS NULL OR tipo_cambio > 0),
  tc_fuente       text,                       -- origen del tipo de cambio (p.ej. BCE)
  tc_fecha        date,
  importado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trading_operaciones_broker_trade_uk UNIQUE (broker, trade_id)
);

CREATE INDEX IF NOT EXISTS trading_operaciones_cuenta_simbolo_idx
  ON public.trading_operaciones (cuenta_id, simbolo, ejecutado_en);
CREATE INDEX IF NOT EXISTS trading_operaciones_fecha_idx
  ON public.trading_operaciones (cuenta_id, fecha);
-- Índice parcial: la cola de trabajo del rellenador de tipos de cambio.
CREATE INDEX IF NOT EXISTS trading_operaciones_sin_tc_idx
  ON public.trading_operaciones (cuenta_id, fecha) WHERE tipo_cambio IS NULL;

-- Marca de sincronización, misma razón que en trading_cartera_real_sync: sin ella no se distingue
-- «la pasada leyó IBKR y no había operaciones nuevas» de «hace tres semanas que no se lee». Lo
-- primero es un dato; lo segundo es una avería, y sin esta fila se ven exactamente igual.
CREATE TABLE IF NOT EXISTS public.trading_operaciones_sync (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id       uuid NOT NULL,
  broker          text NOT NULL,
  ultima_ejecucion timestamptz,               -- la más reciente que hay en el libro (NULL = libro vacío)
  num_operaciones integer NOT NULL DEFAULT 0, -- total acumulado tras la última pasada
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_trading_operaciones_sync
  ON public.trading_operaciones_sync (cuenta_id, broker);

-- Vistas de explotación. NO convierten a euros a propósito: mientras tipo_cambio siga a NULL,
-- una cifra en euros sería una invención con pinta de dato exacto.
CREATE OR REPLACE VIEW public.v_trading_resumen_anual AS
SELECT cuenta_id,
       EXTRACT(year FROM fecha)::int AS anio,
       divisa,
       count(*)                      AS operaciones,
       count(DISTINCT simbolo)       AS simbolos,
       sum(pnl_broker)               AS pnl_broker,
       sum(comision)                 AS comisiones,
       count(*) FILTER (WHERE tipo_cambio IS NULL) AS sin_tipo_cambio
FROM public.trading_operaciones
WHERE tipo_activo = 'STK'
GROUP BY 1,2,3;

-- Cómo se cierran las posiciones. distancia_media_pct mide a qué distancia del coste saltó la
-- venta; en STOP indica lo ajustado que estaba el stop.
CREATE OR REPLACE VIEW public.v_trading_salidas AS
SELECT cuenta_id,
       EXTRACT(year FROM fecha)::int    AS anio,
       coalesce(tipo_orden, 'SIN_TIPO') AS tipo_orden,
       divisa,
       count(*)                              AS ventas,
       count(*) FILTER (WHERE pnl_broker < 0) AS ventas_en_perdida,
       sum(pnl_broker)                       AS pnl_broker,
       round(avg(pnl_broker / nullif(cantidad*precio - pnl_broker, 0)) * 100, 2) AS distancia_media_pct
FROM public.trading_operaciones
WHERE lado = 'SELL' AND tipo_activo = 'STK'
GROUP BY 1,2,3,4;

-- Defensa en profundidad: BD compartida con el cliente anon de ialimp → nunca visible por REST.
ALTER TABLE public.trading_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_operaciones_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trading_operaciones FROM anon, authenticated;
REVOKE ALL ON public.trading_operaciones_sync FROM anon, authenticated;
REVOKE ALL ON public.v_trading_resumen_anual FROM anon, authenticated;
REVOKE ALL ON public.v_trading_salidas FROM anon, authenticated;
