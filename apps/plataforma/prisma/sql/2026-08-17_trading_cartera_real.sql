-- 💼 Cartera REAL del bróker (Interactive Brokers) para el panel /trading.
-- La app en Vercel NO habla con IBKR: las posiciones las empuja la pasada diaria del agente
-- `trading-analista` (que sí tiene el MCP de IBKR, solo lectura) vía POST /api/trading/cartera
-- (Bearer ALERTA_TOKEN/CRON_SECRET). Mismo patrón que broker_saldos (NAV agregado): aquí se
-- PERSISTE la última foto conocida de cada posición para pintarla con su P&L en el panel.
--
-- Dos tablas a propósito (regla «dato que NO hay ≠ dato que NO se ha mirado»): las posiciones
-- solas no distinguen «cartera vacía» de «nunca sincronizada» — si Alberto vende todo, el
-- reemplazo deja 0 filas y eso ES un dato. La marca de sincronización vive en
-- trading_cartera_real_sync: sin fila = «sin leer todavía», fila con 0 = «leída, sin posiciones».
--
-- BD COMPARTIDA multi-tenant. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- prisma_plataforma es BYPASSRLS → sin políticas RLS. NUNCA exponer por REST/anon.

CREATE TABLE IF NOT EXISTS public.trading_cartera_real (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id         uuid NOT NULL,             -- dueño (scope multi-tenant, = cuentas.id)
  broker            text NOT NULL,             -- 'Interactive Brokers'
  simbolo           text NOT NULL,             -- 'VWCE'
  descripcion       text,                      -- 'VANG FTSE AW USDA (VWCE @IBIS2)'
  cantidad          numeric(18,4) NOT NULL,
  -- Importes en la DIVISA de la posición (columna divisa), NO siempre EUR: mezclar divisas al
  -- sumar es el error de unidad del PR #1189. NULL = IBKR no lo dio (jamás un 0 inventado).
  precio_medio      numeric(18,6),             -- coste medio por unidad
  precio_actual     numeric(18,6),             -- market price del último refresco
  valor_mercado     numeric(16,2),             -- market value
  pnl_no_realizado  numeric(16,2),
  pnl_diario        numeric(16,2),
  divisa            text NOT NULL DEFAULT 'EUR',
  actualizado_en    timestamptz NOT NULL DEFAULT now()
);

-- Una fila por posición; el refresco del agente REEMPLAZA el set entero de cuenta+broker.
CREATE UNIQUE INDEX IF NOT EXISTS uq_trading_cartera_real_pos
  ON public.trading_cartera_real (cuenta_id, broker, simbolo);
CREATE INDEX IF NOT EXISTS idx_trading_cartera_real_cuenta ON public.trading_cartera_real (cuenta_id);

-- Marca de sincronización: cuándo se leyó IBKR por última vez y cuántas posiciones había.
CREATE TABLE IF NOT EXISTS public.trading_cartera_real_sync (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id       uuid NOT NULL,
  broker          text NOT NULL,
  num_posiciones  integer NOT NULL DEFAULT 0,
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_trading_cartera_real_sync
  ON public.trading_cartera_real_sync (cuenta_id, broker);

-- Defensa en profundidad: BD compartida con el cliente anon de ialimp → nunca visible por REST.
ALTER TABLE public.trading_cartera_real ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_cartera_real_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trading_cartera_real FROM anon, authenticated;
REVOKE ALL ON public.trading_cartera_real_sync FROM anon, authenticated;
