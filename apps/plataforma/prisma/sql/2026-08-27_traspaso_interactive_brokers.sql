-- 27/08/2026 — Traspasos a Interactive Brokers mal clasificados como gasto de la correduría.
--
-- El movimiento de BBVA del 24/08/2026 (-1.000,00€, "ORDENES PAGO EMITIDAS EN MONEDA LOCAL //
-- TRANSFERENCIA REALIZADA // U9007431 / Alberto Suarez Gutierrez", contraparte "Interactive broker")
-- entró como destino='seguros' + requiere_revision: es el cajón por DESCARTE de los cargos de BBVA
-- en lib/destino.ts, porque RE_TITULAR solo mira `contraparte` y ahí BBVA pone el broker, no el
-- titular. Es un traspaso a la cuenta de valores del propio Alberto: cambia de bolsillo, NO es un
-- gasto deducible de la correduría. Los dos traspasos anteriores a la MISMA cuenta IBKR (U9007431,
-- 21/01/2025 y 26/11/2025, -15.000€ cada uno) ya estaban como 'traspaso_interno' a mano.
--
-- La regla ya vive en lib/destino.ts (RE_BROKER), así que los futuros entran bien solos; este
-- backfill es para las filas ya ingestadas — `destino_confirmado`/`requiere_revision` las sacan del
-- camino de re-clasificación automática (mismo patrón que 2026-07-18_fix_cuota_autonomos_personal.sql).
--
-- Comprobado antes de ejecutar: el patrón "U + 7-8 dígitos" NO casa ningún otro concepto del libro.

UPDATE movimientos_bancarios
SET destino             = 'traspaso_interno',
    destino_confirmado  = true,
    requiere_revision   = false
WHERE (concepto ~* '\yU[0-9]{7,8}\y' OR COALESCE(contraparte, '') ~* 'INTERACTIVE\s*BROKERS?|IBKR')
  AND destino IS DISTINCT FROM 'traspaso_interno';
