-- Reclasifica a 'personal' los movimientos de Kutxabank que quedaron en 'seguros'
-- con destino_confirmado=true tras el fix del 23/06/2026.
--
-- La SQL anterior (2026-06-23_seguros_solo_bbva.sql) tenía la condición
-- "AND mb.destino_confirmado = false", respetando los confirmados. Pero
-- Kutxabank NUNCA es cuenta de correduría (solo BBVA): los recibos de seguros
-- propios (Generali autos, ASISA, GIP…) que se confirmaron manualmente ANTES de
-- que se estableciera la regla "seguros = solo BBVA" quedaron mal clasificados.
--
-- Afecta: 23 movimientos (GENERALI, ASISA, GIP...) por -2.333,54€.
-- Resultado tras corrección: correduría pasa de -2.026€ a +1.255€.
-- YA APLICADO por MCP a la BD compartida (01/07/2026).

UPDATE movimientos_bancarios mb
SET destino           = 'personal',
    destino_confirmado = true,
    requiere_revision  = false
FROM cuentas_bancarias cb
WHERE mb.cuenta_bancaria_id = cb.id
  AND mb.destino = 'seguros'
  AND cb.banco NOT ILIKE '%BBVA%'
  AND cb.banco NOT ILIKE '%Importado%'
  AND COALESCE(mb.duplicado_estado, '') <> 'ignorado';
