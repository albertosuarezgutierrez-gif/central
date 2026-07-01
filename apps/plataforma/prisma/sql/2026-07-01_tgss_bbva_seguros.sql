-- Reclasifica cuotas de autónomos (TGSS/Seguridad Social) en BBVA de 'personal' a 'seguros'.
-- La cuota RETA de Alberto (corredor de seguros) es gasto deducible de la correduría
-- (Art. 30.2.1ª LIRPF). Alberto confirmó explícitamente el 01/07/2026.
--
-- Afecta solo a movimientos de cuentas BBVA del titular (no del cónyuge, que va a actividad_pilar).
-- Solo los clasificados automáticamente como 'personal' (destino_confirmado=false): los confirmados
-- manualmente por el usuario se respetan.

UPDATE movimientos_bancarios mb
SET
  destino             = 'seguros',
  subcategoria        = 'cuota_autonomos',
  destino_confirmado  = true
FROM cuentas_bancarias cb
WHERE mb.cuenta_bancaria_id = cb.id
  AND cb.banco ILIKE '%BBVA%'
  AND coalesce(cb.titular, 'titular') <> 'conyuge'
  AND mb.destino = 'personal'
  AND mb.destino_confirmado = false
  AND mb.importe < 0
  AND (
    mb.concepto ILIKE '%TGSS%'
    OR mb.concepto ILIKE '%TESORERIA GENERAL%'
    OR mb.concepto ILIKE '%TESORERÍA GENERAL%'
    OR mb.concepto ILIKE '%SEGURIDAD SOCIAL%'
    OR mb.contraparte ILIKE '%TGSS%'
    OR mb.contraparte ILIKE '%TESORERIA GENERAL%'
    OR mb.contraparte ILIKE '%TESORERÍA GENERAL%'
    OR mb.contraparte ILIKE '%SEGURIDAD SOCIAL%'
  );
