-- Saldo de cuentas de bróker/inversión (Interactive Brokers) para la vista 💶 Dinero de /banca.
-- La app en Vercel NO puede conectarse a IBKR por sí sola: el dato entra por la pasada diaria del
-- agente `trading-analista` (que sí tiene el MCP de IBKR), vía POST /api/trading/saldo (Bearer
-- CRON_SECRET). Aquí solo se PERSISTE el último saldo conocido por cuenta y bróker, para pintarlo
-- como una tarjeta más (igual que BBVA/Kutxabank) y sumarlo al «Saldo total del grupo».
--
-- BD COMPARTIDA multi-tenant. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- prisma_plataforma es BYPASSRLS → sin políticas RLS. NUNCA exponer por REST/anon.

CREATE TABLE IF NOT EXISTS public.broker_saldos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id      uuid NOT NULL,               -- dueño (scope multi-tenant, = cuentas.id)
  broker         text NOT NULL,               -- 'Interactive Brokers'
  saldo          numeric(14,2) NOT NULL,      -- net liquidation value en la divisa base (EUR)
  divisa         text NOT NULL DEFAULT 'EUR',
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- Una fila por cuenta+bróker (clave del upsert que refresca el agente).
CREATE UNIQUE INDEX IF NOT EXISTS uq_broker_saldos_cuenta_broker
  ON public.broker_saldos (cuenta_id, broker);

-- Lectura scopeada por cuenta en la vista Dinero.
CREATE INDEX IF NOT EXISTS idx_broker_saldos_cuenta ON public.broker_saldos (cuenta_id);

-- Defensa en profundidad: BD compartida con el cliente anon de ialimp → nunca visible por REST.
ALTER TABLE public.broker_saldos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.broker_saldos FROM anon, authenticated;
