-- Atribución de gasto de IA por CLIENTE (para refacturar) + presupuestos diarios por ámbito.
-- ai_usos.cliente_ref: identificador libre del cliente final que origina la llamada
-- (ej. 'ialimp:sique-brilla', uuid de cuenta). NULL = tráfico interno del grupo.
ALTER TABLE public.ai_usos ADD COLUMN IF NOT EXISTS cliente_ref text;
CREATE INDEX IF NOT EXISTS ai_usos_cliente_idx ON public.ai_usos(cliente_ref, creada_at) WHERE cliente_ref IS NOT NULL;

-- Presupuestos diarios de IA en € por ámbito. El global va por env (AI_GATEWAY_LIMITE_DIARIO_EUR);
-- aquí viven los específicos: por vertical (ambito='app', ref='ialimp') y por cliente
-- (ambito='cliente', ref='ialimp:sique-brilla'). Habrá clientes con más presupuesto que otros.
-- limite_diario_eur = 0 → sin límite específico (aplica solo el global).
CREATE TABLE IF NOT EXISTS public.ia_presupuestos (
  id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  ambito             text           NOT NULL,            -- 'app' | 'cliente'
  ref                text           NOT NULL,            -- valor de ai_usos.app o de ai_usos.cliente_ref
  limite_diario_eur  numeric(12,4)  NOT NULL DEFAULT 0,
  creada_at          timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (ambito, ref)
);
