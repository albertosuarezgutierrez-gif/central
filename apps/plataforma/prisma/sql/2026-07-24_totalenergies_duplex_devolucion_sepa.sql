-- Recibo de TotalEnergies (luz/gas) en BBVA devuelto: caso "Gastos por revisar · categoría" del
-- 24/07/2026. Dos correcciones, en orden (la 2 depende de que la 1 ya haya puesto el destino):
--
--  1) TotalEnergies en BBVA que cayó a 'seguros' por descarte (destino.ts no lo conocía) → es luz/gas
--     del Dúplex, NO correduría. Reclasificar a turistico_duplex y darlo por confirmado.
--  2) Devoluciones de adeudos SEPA ("ANULACION ADEUDOS DIRECTOS"): heredan el destino de su cargo
--     (misma referencia "N <ref>") y se dan por cuadradas → cargo + anulación netean a 0 y salen de
--     las bandejas «por revisar». Ej.: N 2026198000644355 (cargo -3,98 + anulación +3,98).
--
-- Idempotente: los WHERE solo tocan filas que aún están mal (seguros / sin confirmar). El fix en
-- código (lib/destino.ts + lib/categorizar.ts::casarDevolucionesSepa) evita que vuelva a pasar.

-- 1) TotalEnergies en BBVA mal imputado a la correduría → Dúplex.
UPDATE movimientos_bancarios mb
SET destino = 'turistico_duplex', destino_confirmado = true, requiere_revision = false
FROM cuentas_bancarias cb
WHERE cb.id = mb.cuenta_bancaria_id
  AND cb.banco ILIKE '%BBVA%'
  AND mb.destino = 'seguros'
  AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
  AND (mb.concepto ILIKE '%TE ELECTRICIDAD%'
    OR mb.concepto ILIKE '%TOTALENERG%'
    OR mb.concepto ILIKE '%TOTAL GAS Y ELECT%');

-- 2) Anulaciones de adeudos SEPA → heredan el destino del cargo con la misma referencia.
UPDATE movimientos_bancarios ab
SET destino = ca.destino, destino_confirmado = true, requiere_revision = false
FROM movimientos_bancarios ca, cuentas_bancarias cb
WHERE ab.cuenta_bancaria_id = cb.id
  AND ca.cuenta_bancaria_id = cb.id
  AND ab.importe > 0
  AND ca.importe < 0
  AND ca.destino IS NOT NULL
  AND ab.concepto ILIKE '%ANULACION%ADEUDO%'
  AND ca.concepto ILIKE '%ADEUDO A SU CARGO%'
  AND substring(ab.concepto from 'N ([0-9]{10,})') IS NOT NULL
  AND substring(ab.concepto from 'N ([0-9]{10,})') = substring(ca.concepto from 'N ([0-9]{10,})')
  AND abs(abs(ab.importe) - abs(ca.importe)) < 0.005
  AND COALESCE(ab.destino_confirmado, false) = false
  AND COALESCE(ab.duplicado_estado, '') <> 'ignorado';
