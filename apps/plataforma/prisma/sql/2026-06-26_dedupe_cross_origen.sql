-- Depuración GENERAL de duplicados cross-origen (26/06/2026). YA APLICADO a la BD compartida
-- por MCP (data, no schema). Generaliza el dedup específico de Booking de 2026-06-23.
--
-- Causa: la tabla `movimientos_bancarios` se cargó por DOS vías que se solapan en mar–jun 2026:
--   · feed del banco  -> origen='psd2'      (concepto verboso: "RECIBO DIGI SPAIN TELECO  FACTURA DIGI")
--   · Excels manuales -> origen='xls-kutxa'/'xls-bbva'/'xls' (concepto truncado: "RECIBO DIGI SPAIN TELECO")
-- El `dedupe_hash` se calcula por CONTENIDO (incluye el concepto), así que el MISMO movimiento
-- tiene hash distinto en cada vía y el `ON CONFLICT (cuenta_bancaria_id, dedupe_hash)` no lo colapsa.
-- Resultado: 138 movimientos duplicados (cross-origen) + 5 internos = 143 filas sobrantes,
-- inflando el P&L en +41.762,85€ de ingreso fantasma y +11.872,60€ de gasto fantasma.
--
-- Regla (reversible): conservar SIEMPRE el feed del banco (psd2 > xls-kutxa > xls-bbva > xls > manual)
-- y marcar el resto con `duplicado_estado='ignorado'` (NO se borra; `/finanzas` ya excluye 'ignorado').
-- Antes de marcar, se propaga `destino_confirmado` al superviviente para no perder categorización.
-- La PREVENCIÓN automática vive en lib/banca.ts::importarExtracto (guarda anti-duplicado cross-origen).

-- (1) Propagar la categorización confirmada al movimiento que se conserva (el de origen prioritario).
WITH g AS (
  SELECT cuenta_bancaria_id, fecha_operacion, importe,
    min(CASE origen WHEN 'psd2' THEN 1 WHEN 'xls-kutxa' THEN 2 WHEN 'xls-bbva' THEN 3 WHEN 'xls' THEN 4 ELSE 5 END) AS win_pri,
    bool_or(destino_confirmado) AS any_conf,
    max(destino) FILTER (WHERE destino_confirmado) AS conf_destino
  FROM movimientos_bancarios
  WHERE duplicado_estado IS DISTINCT FROM 'ignorado'
  GROUP BY 1, 2, 3
  HAVING count(*) > 1 AND count(DISTINCT origen) > 1
)
UPDATE movimientos_bancarios m
SET destino_confirmado = true,
    destino = COALESCE(m.destino, g.conf_destino)
FROM g
WHERE m.cuenta_bancaria_id = g.cuenta_bancaria_id AND m.fecha_operacion = g.fecha_operacion AND m.importe = g.importe
  AND (CASE m.origen WHEN 'psd2' THEN 1 WHEN 'xls-kutxa' THEN 2 WHEN 'xls-bbva' THEN 3 WHEN 'xls' THEN 4 ELSE 5 END) = g.win_pri
  AND g.any_conf AND NOT m.destino_confirmado
  AND m.duplicado_estado IS DISTINCT FROM 'ignorado';

-- (2) Cross-origen: marcar como duplicado todas las filas de origen NO prioritario del grupo.
WITH g AS (
  SELECT cuenta_bancaria_id, fecha_operacion, importe,
    min(CASE origen WHEN 'psd2' THEN 1 WHEN 'xls-kutxa' THEN 2 WHEN 'xls-bbva' THEN 3 WHEN 'xls' THEN 4 ELSE 5 END) AS win_pri
  FROM movimientos_bancarios
  WHERE duplicado_estado IS DISTINCT FROM 'ignorado'
  GROUP BY 1, 2, 3
  HAVING count(*) > 1 AND count(DISTINCT origen) > 1
)
UPDATE movimientos_bancarios m
SET duplicado_estado = 'ignorado',
    comentario = COALESCE(m.comentario || ' | ', '') || 'dedup 2026-06-26: copia de import duplicada; se conserva el movimiento del banco'
FROM g
WHERE m.cuenta_bancaria_id = g.cuenta_bancaria_id AND m.fecha_operacion = g.fecha_operacion AND m.importe = g.importe
  AND (CASE m.origen WHEN 'psd2' THEN 1 WHEN 'xls-kutxa' THEN 2 WHEN 'xls-bbva' THEN 3 WHEN 'xls' THEN 4 ELSE 5 END) > g.win_pri
  AND m.duplicado_estado IS DISTINCT FROM 'ignorado';

-- (3) Mismo-origen exacto: misma referencia bancaria (reingestión del feed) o mismo concepto sin
-- referencia. Conserva el más antiguo. NO toca repeticiones legítimas (conceptos/referencias distintos:
-- p. ej. 3 Bizums de 61,25€ el mismo día, o dos transferencias "casa"/"casa rural").
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY cuenta_bancaria_id, fecha_operacion, importe, origen, concepto, COALESCE(referencia, '')
      ORDER BY created_at, id
    ) AS rn
  FROM movimientos_bancarios
  WHERE duplicado_estado IS DISTINCT FROM 'ignorado'
)
UPDATE movimientos_bancarios m
SET duplicado_estado = 'ignorado',
    comentario = COALESCE(m.comentario || ' | ', '') || 'dedup 2026-06-26: duplicado interno (mismo concepto/referencia)'
FROM ranked r
WHERE m.id = r.id AND r.rn > 1;

-- (4) Reingestión del banco con la MISMA referencia (el feed psd2 reentró el mismo movimiento con
-- el concepto cambiado de "Nº" a "N "). La referencia bancaria es única -> conserva el más antiguo.
WITH ranked AS (
  SELECT id,
    row_number() OVER (PARTITION BY cuenta_bancaria_id, referencia ORDER BY created_at, id) AS rn
  FROM movimientos_bancarios
  WHERE duplicado_estado IS DISTINCT FROM 'ignorado'
    AND referencia IS NOT NULL AND referencia <> ''
)
UPDATE movimientos_bancarios m
SET duplicado_estado = 'ignorado',
    comentario = COALESCE(m.comentario || ' | ', '') || 'dedup 2026-06-26: reingestion del banco (misma referencia)'
FROM ranked r
WHERE m.id = r.id AND r.rn > 1;

-- Para DESHACER todo el saneamiento de hoy (reversible):
--   UPDATE movimientos_bancarios SET duplicado_estado = NULL
--   WHERE comentario LIKE '%dedup 2026-06-26%' OR comentario LIKE '%auto-dedup: duplicado del feed%';
