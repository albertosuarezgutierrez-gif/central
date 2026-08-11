-- Incidente 01/08/2026 — la cuota de la Seguridad Social (RETA) de julio salía ❌ NO DEDUCIBLE.
--
-- Causa: una regla aprendida `banca_destino_reglas` con clave GENÉRICA **'CUOTA' → personal**
-- (creada el 18/07/2026, probablemente al confirmar como personal la cuota de la hipoteca
-- "CUOTA PTMO" o la de la comunidad de Monte Carmelo). Las reglas se aplican por SUBSTRING del
-- concepto y con PRIORIDAD sobre `lib/destino.ts`, así que 'CUOTA' se tragaba también
-- "ADEUDO DE CUOTA DE LA SEGURIDAD SOCIAL // PAGO DE IMPUESTO // ... TGSS. COTIZACION 005
-- R.E.AUTONOMOS" y lo mandaba a `personal` (bucket no deducible), pese a que `destino.ts` ya
-- clasifica esas cuotas en BBVA como `seguros`+`cuota_autonomos` (deducible, Art. 30.2.1ª LIRPF).
-- Mismo patrón que el landmine "TRANSF" del PR #840.
--
-- Fix de código: 'CUOTA'/'CUOTAS'/'IMPUESTO(S)'/'COTIZACION'/'PTMO'/'PRESTAMO' añadidos a
-- CLAVE_GENERICA en lib/correduria.ts → `claveReglaValida` las rechaza al APRENDER y al APLICAR.
-- Este SQL borra la regla ya guardada y reclasifica el movimiento que quedó mal.

-- 1) Borrar la regla trampa (y cualquier otra con clave genérica de este tipo).
DELETE FROM banca_destino_reglas
WHERE upper(trim(clave)) IN ('CUOTA', 'CUOTAS', 'IMPUESTO', 'IMPUESTOS', 'COTIZACION', 'PTMO', 'PRESTAMO');

-- 2) Reclasificar las cuotas de autónomos de BBVA que quedaron en 'personal' sin confirmar.
--    (Las confirmadas a mano por Alberto se respetan; hoy no hay ninguna en ese caso.)
UPDATE movimientos_bancarios mb
SET destino            = 'seguros',
    subcategoria       = 'cuota_autonomos',
    destino_confirmado = true,
    requiere_revision  = false          -- invariante PR #906: confirmar destino limpia el flag
FROM cuentas_bancarias cb
WHERE mb.cuenta_bancaria_id = cb.id
  AND cb.banco ILIKE '%BBVA%'
  AND coalesce(cb.titular, 'titular') <> 'conyuge'
  AND mb.importe < 0
  AND mb.destino = 'personal'
  AND coalesce(mb.destino_confirmado, false) = false
  AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
  AND (mb.concepto ILIKE '%SEGURIDAD SOCIAL%' OR mb.concepto ILIKE '%TGSS%'
       OR mb.contraparte ILIKE '%SEGURIDAD SOCIAL%' OR mb.contraparte ILIKE '%TGSS%');
