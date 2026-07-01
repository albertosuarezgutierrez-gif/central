-- Backfill: marca como 'ignorado' los movimientos de cuenta corriente que duplican
-- los de la tarjeta vinculada (mismo sociedad_id, misma fecha, mismo importe).
--
-- Contexto (01/07/2026): Kutxabank exporta los cargos de la tarjeta de crédito/débito
-- tanto en el extracto de la CUENTA CORRIENTE (tipo='corriente') como en el extracto
-- propio de la TARJETA (tipo='tarjeta'). Al importar ambos Excels, la misma compra entra
-- bajo dos cuenta_bancaria_id distintos → 47 cargos duplicados, 3.764€ de gastos inflados.
-- La guarda anti-dedup de importarExtracto (LANDMINE 26/06) solo cubría xls vs psd2;
-- no detectaba xls-corriente vs xls-tarjeta.
--
-- Regla: conservar el movimiento de tipo='tarjeta' (tiene el detalle del comercio).
-- La corriente ve el cargo pero como movimiento derivado del uso de la tarjeta.
-- Condición: misma sociedad_id + misma fecha_operacion + mismo importe.
-- Reversible: UPDATE duplicado_estado = NULL WHERE comentario ILIKE '%backfill 2026-07-01%'.

WITH candidatos AS (
  SELECT m_corr.id
  FROM movimientos_bancarios m_tarj
  JOIN cuentas_bancarias cb_tarj
    ON cb_tarj.id = m_tarj.cuenta_bancaria_id AND cb_tarj.tipo = 'tarjeta'
  JOIN movimientos_bancarios m_corr
    ON m_corr.fecha_operacion = m_tarj.fecha_operacion
   AND m_corr.importe = m_tarj.importe
   AND m_corr.id <> m_tarj.id
  JOIN cuentas_bancarias cb_corr
    ON cb_corr.id = m_corr.cuenta_bancaria_id
   AND cb_corr.tipo IN ('corriente', 'ahorro')
   AND cb_corr.sociedad_id = cb_tarj.sociedad_id
  WHERE coalesce(m_tarj.duplicado_estado, '') <> 'ignorado'
    AND coalesce(m_corr.duplicado_estado, '') <> 'ignorado'
)
UPDATE movimientos_bancarios m
SET duplicado_estado = 'ignorado',
    comentario = COALESCE(m.comentario || ' | ', '') ||
                 'auto-dedup: duplicado cross-cuenta tarjeta↔corriente [backfill 2026-07-01]'
WHERE m.id IN (SELECT id FROM candidatos);

-- Verificar resultado:
-- SELECT count(*), sum(abs(importe::float)) FROM movimientos_bancarios
-- WHERE comentario LIKE '%backfill 2026-07-01%';
-- → 47 filas, 3764.34 €
