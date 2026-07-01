-- Repara subcategoria NULL en movimientos de Pilar importados antes de 2026-06-23
-- (cuando se añadió la columna subcategoria en pilar_autonoma.sql)
UPDATE movimientos_bancarios mb
SET subcategoria = CASE
  WHEN (coalesce(mb.concepto, '') || ' ' || coalesce(mb.contraparte, '')) ~* 'TGSS|Seguridad Social' THEN 'cuota_autonomos'
  WHEN mb.importe > 0 THEN 'cobro_cliente'
  ELSE 'gasto_profesional'
END
FROM cuentas_bancarias cb
WHERE mb.cuenta_bancaria_id = cb.id
  AND cb.titular = 'conyuge'
  AND mb.destino = 'actividad_pilar'
  AND mb.subcategoria IS NULL;
