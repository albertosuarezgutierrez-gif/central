-- Saneo 30/07/2026 — pares psd2 del MISMO movimiento con el concepto re-servido distinto.
-- BBVA muta a veces la puntuación del concepto entre sesiones («LIQ. OP. Nº» ↔ «LIQ. OP. N»);
-- como el dedupe_hash incluye el concepto literal, el ON CONFLICT no los caza y el movimiento
-- entra dos veces (pares reales: 16/06, 25/06 —ya saneados a mano— y 22/07/2026, 413,17€ del
-- Dúplex, cazado por el Check 1 del health-check). Se marca 'ignorado' la fila MÁS RECIENTE
-- de cada par (se conserva la que el P&L ya contó). Idempotente. La guarda equivalente en
-- la ingesta vive en lib/psd2.ts (sincronizarSesion), añadida en el mismo PR.
UPDATE movimientos_bancarios n
SET duplicado_estado = 'ignorado',
    comentario = COALESCE(n.comentario || ' | ', '') || 'auto-dedup: mismo movimiento psd2 con el concepto re-servido distinto'
WHERE n.origen = 'psd2'
  AND coalesce(n.duplicado_estado, '') <> 'ignorado'
  AND EXISTS (
    SELECT 1 FROM movimientos_bancarios v
    WHERE v.origen = 'psd2'
      AND v.cuenta_bancaria_id = n.cuenta_bancaria_id
      AND v.fecha_operacion IS NOT DISTINCT FROM n.fecha_operacion
      AND v.importe = n.importe
      AND v.id <> n.id
      AND coalesce(v.duplicado_estado, '') <> 'ignorado'
      AND (v.created_at < n.created_at OR (v.created_at = n.created_at AND v.id < n.id))
      AND regexp_replace(upper(coalesce(v.concepto, '')), '[^A-Z0-9]', '', 'g')
          = regexp_replace(upper(coalesce(n.concepto, '')), '[^A-Z0-9]', '', 'g')
  );
