-- 27/08/2026 — FINANCIALDATASETS.AI: herramienta profesional, no cajón de descarte.
--
-- La API de fundamentales que alimenta el radar de trading se cobra en BBVA y no casaba ninguna regla
-- de lib/destino.ts, así que caía al cajón por DESCARTE de los cargos de BBVA → destino='seguros' con
-- `requiere_revision`: volvía a la bandeja «por revisar» cada mes aunque ya se hubiera confirmado.
--
-- Decisión de Alberto (27/08/2026): entra en RE_SOFTWARE como Vercel/Anthropic/GitHub → sigue en
-- 'seguros' (deducible de la actividad) pero con subcategoría 'informatica' y AUTO-CONFIRMADO, que es
-- lo que la saca de la bandeja. La regla ya vive en destino.ts; este backfill es para lo ya ingestado
-- (con requiere_revision/destino_confirmado de por medio, la fila no se re-clasifica sola nunca).

UPDATE movimientos_bancarios
SET destino            = 'seguros',
    subcategoria       = 'informatica',
    destino_confirmado = true,
    requiere_revision  = false
WHERE (COALESCE(concepto, '') || ' ' || COALESCE(contraparte, '')) ~* '\yFINANCIALDATASETS\y'
  AND (subcategoria IS DISTINCT FROM 'informatica' OR requiere_revision OR NOT destino_confirmado);
