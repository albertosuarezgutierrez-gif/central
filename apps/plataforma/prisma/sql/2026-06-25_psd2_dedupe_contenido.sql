-- PSD2: dedupe ESTABLE por contenido (25/06/2026) — arregla movimientos duplicados.
--
-- Contexto: el importador PSD2 (lib/psd2.ts) deduplicaba por dedupe_hash derivado del
-- entry_reference del banco (o, en su defecto, del accountUid de Enable Banking). AMBOS ROTAN
-- entre sesiones/consentimientos, así que el cron `psd2-sync` del 24/06/2026 reinsertó 15
-- movimientos ya existentes (importados el 14/06) con un hash distinto que burló el
-- ON CONFLICT (cuenta_bancaria_id, dedupe_hash): cuota del préstamo `CUOTA PTMO 856289293-5`
-- (×3 meses), recibos `TARJ.CRDTO` (×6), `KUTXABANK SEG. VIDA` (×2), `RECIBO AYTO. SEVILLA`,
-- comisión de emisión, liquidación de intereses y una devolución de la AEAT.
--
-- Arreglo: la clave de dedupe pasa a ser por CONTENIDO estable =
--   cuenta_bancaria_id | fecha_operacion | importe(2 dec) | upper(trim(concepto))
-- Coincide BYTE A BYTE con hashMov() de lib/psd2.ts (verificado node↔postgres: la cuota PTMO
-- 05/06 da 7044dc1c5a3495835cbbbb36c8df4f496c4d11c0 en ambos).
--
-- ⚠️ ORDEN DE APLICACIÓN: ejecutar JUNTO al despliegue del nuevo lib/psd2.ts. Con el código
-- viejo (hash por entry_reference) y este backfill ya aplicado, la siguiente pasada del cron
-- volvería a duplicar (su hash no casaría con el de contenido). Aplicar tras el deploy, antes
-- del siguiente cron `psd2-sync` (06:00 UTC).
--
-- MATIZ asumido: dos movimientos PSD2 realmente idénticos el mismo día (misma cuenta, importe y
-- concepto) se colapsarían en uno. En cuenta personal es rarísimo y ya lo asumía el dedupe
-- en-memoria previo (`vistosContenido`).

BEGIN;

-- 1) Borra las copias sobrantes: conserva la fila más antigua de cada grupo de contenido.
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY cuenta_bancaria_id, fecha_operacion, importe, concepto
      ORDER BY created_at, id
    ) AS rn
  FROM movimientos_bancarios
  WHERE origen = 'psd2'
)
DELETE FROM movimientos_bancarios m
USING ranked r
WHERE m.id = r.id AND r.rn > 1;

-- 2) Reescribe dedupe_hash de TODAS las filas psd2 al esquema por contenido, para que las
--    próximas pasadas del cron (que ya hashean por contenido) casen con lo existente y no
--    vuelvan a insertar duplicados.
UPDATE movimientos_bancarios
SET dedupe_hash = encode(digest(
  cuenta_bancaria_id::text || '|' || coalesce(fecha_operacion::text, '') || '|' ||
  to_char(importe, 'FM999999990.00') || '|' || upper(trim(coalesce(concepto, ''))), 'sha1'), 'hex')
WHERE origen = 'psd2';

COMMIT;
