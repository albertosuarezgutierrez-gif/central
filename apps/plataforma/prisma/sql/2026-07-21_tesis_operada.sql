-- 💡 «Ideas de compra del agente» = solo compras REALES, no señales técnicas en bruto.
--
-- Problema (auditoría 21/07/2026): el panel /trading «Ideas de compra del agente» leía trading_tesis y
-- mostraba TODA señal direccion='alcista'. Esas filas son las señales CRUDAS de cada estrategia del torneo
-- (persistidas por /api/trading/analizar ANTES de las barreras y sin saber cuál ganó). Resultado: un valor
-- podía salir como «idea de compra momentum» aunque (a) el ganador de su torneo fuese BAJISTA (p.ej. CVX con
-- RSI 81: la reversión sobrecompra/70 gana al momentum/68), y/o (b) las barreras (factorFlojo, bajoTendencia,
-- régimen, earnings…) lo vetaran. Contradecía la tarjeta «Analiza una acción» (que a CVX lo marcaba
-- calidad débil + técnico «en espera»).
--
-- Fix: columna `operada` en trading_tesis. La pone /api/trading/analizar SOLO en la señal ganadora que
-- además abrió posición en paper. El panel filtra alcista AND operada.
--
-- Idempotente. Aplicar por Supabase MCP (rol postgres).

ALTER TABLE trading_tesis ADD COLUMN IF NOT EXISTS operada boolean NOT NULL DEFAULT false;

-- Backfill del histórico: una tesis se considera operada si existe una orden de COMPRA en paper de ese
-- mismo símbolo/fecha cuyo `motivo` empieza por su estrategia (el motivo se graba como
-- `${estrategia} conf ${confianza}`, ver route.ts). Cada estrategia aparece una vez por (símbolo,fecha),
-- así que el match es unívoco. Los nombres cuyo torneo ganó bajista/neutral (sin orden BUY) quedan en false.
UPDATE trading_tesis t
SET operada = true
WHERE t.direccion = 'alcista'
  AND EXISTS (
    SELECT 1 FROM trading_paper_orden o
    WHERE o.simbolo = t.simbolo
      AND o.fecha = t.fecha
      AND o.lado = 'BUY'
      AND o.motivo LIKE t.estrategia || ' conf %'
  );
