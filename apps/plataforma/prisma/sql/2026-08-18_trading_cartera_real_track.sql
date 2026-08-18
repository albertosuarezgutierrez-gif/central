-- 📈 Serie histórica de la cartera REAL (Interactive Brokers) para pintar su evolución en /trading.
--
-- POR QUÉ: `trading_cartera_real` es una FOTO que la pasada diaria REEMPLAZA (borrar + insertar) y
-- `broker_saldos` es una fila que se pisa — con ese diseño el pasado se destruye cada noche y un
-- gráfico de evolución solo podría tener un punto. Aquí se persiste UN punto por día y divisa.
--
-- Un punto por DIVISA a propósito: sumar euros con dólares es el error de unidad del PR #1189.
-- `completo=false` significa que a alguna posición de esa divisa le faltaba valor o coste, así que
-- el total NO es la cartera entera y la UI lo declara «parcial» (nunca se pinta como si lo fuera).
-- Importes NULL = el bróker no dio el dato; jamás un 0 inventado.
--
-- Sin posiciones NO se escribe fila: «leída y vacía» ya lo registra trading_cartera_real_sync.
--
-- BD COMPARTIDA multi-tenant. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- prisma_plataforma es BYPASSRLS → sin políticas RLS. NUNCA exponer por REST/anon.

CREATE TABLE IF NOT EXISTS public.trading_cartera_real_track (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id       uuid NOT NULL,             -- dueño (scope multi-tenant, = cuentas.id)
  broker          text NOT NULL,             -- 'Interactive Brokers'
  fecha           date NOT NULL,             -- día de la lectura, huso Europe/Madrid
  divisa          text NOT NULL,
  invertido       numeric(16,2),             -- coste agregado de las posiciones de esa divisa
  valor           numeric(16,2),             -- valor de mercado agregado
  pnl             numeric(16,2),             -- P&L no realizado agregado
  completo        boolean NOT NULL DEFAULT true,
  num_posiciones  integer NOT NULL DEFAULT 0,
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

-- Un punto por día y divisa: la última pasada del día REESCRIBE el punto (no se acumulan lecturas
-- intradía, que darían una curva con dientes de sierra sin significado).
CREATE UNIQUE INDEX IF NOT EXISTS uq_trading_cartera_real_track
  ON public.trading_cartera_real_track (cuenta_id, broker, fecha, divisa);
CREATE INDEX IF NOT EXISTS idx_trading_cartera_real_track_cuenta
  ON public.trading_cartera_real_track (cuenta_id, fecha DESC);

-- Defensa en profundidad: BD compartida con el cliente anon de ialimp → nunca visible por REST.
ALTER TABLE public.trading_cartera_real_track ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trading_cartera_real_track FROM anon, authenticated;
