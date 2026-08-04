-- Compras con tarjeta cuya CATEGORÍA CONTABLE cayó en una palabra-trampa del nombre del comercio.
-- Caso real (30/07/2026): "PAGO CON TARJETA EN RESTAURANTES Y CAFETERIAS // ... // LA HACIENDA GOLF"
-- → categoria='impuestos' porque categorizarPorReglas usaba 'HACIENDA' a secas y la regla de compra
-- con tarjeta iba DESPUÉS de las reglas de comercio. Arreglado en lib/categoria-reglas.ts (la compra
-- con tarjeta se detecta primero y 'HACIENDA' suelto se retiró); este backfill sanea lo ya guardado.
--
-- Idempotente y estrecho: solo compras de tarjeta con las categorías erróneas observadas
-- (impuestos/proveedor/otros — 3 filas verificadas en BD el 30/07/2026), excluyendo cualquier
-- concepto que sí sea del fisco. No toca destino, subcategoria ni flags de revisión.
UPDATE movimientos_bancarios
SET categoria = 'tarjeta', categoria_pgc = '572'
WHERE (concepto ILIKE '%PAGO CON TARJETA%' OR concepto ILIKE '%COMPRA EN %')
  AND categoria IN ('impuestos', 'proveedor', 'otros')
  AND concepto NOT ILIKE '%AEAT%'
  AND concepto NOT ILIKE '%AGENCIA TRIBUTARIA%'
  AND concepto NOT ILIKE '%IMPUESTO DE HACIENDA%'
  AND concepto NOT ILIKE '%TRIBUT HACIENDA%'
  AND concepto NOT ILIKE '%HACIENDA PUBLICA%';
