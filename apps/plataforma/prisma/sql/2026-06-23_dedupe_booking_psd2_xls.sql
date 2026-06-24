-- Depuración de doble conteo de Booking del Dúplex (23/06/2026).
--
-- Contexto: los cobros de Booking en BBVA entraron por DOS vías que se solapan (23-mar → 16-jun 2026):
--   1) Importación manual de Excel (origen='xls-bbva'): concepto colapsado a "Transferencia recibida",
--      sin ordenante (BBVA no lo exporta) → se clasificaban a Dúplex por descarte.
--   2) Feed PSD2 / Enable Banking (origen='psd2'): concepto completo "ABONO ... // LIQ. OP. Nº NNNN"
--      → se clasifican a Dúplex por el marcador FIABLE "LIQ. OP." (lib/destino.ts).
-- Tienen dedupe_hash distinto (concepto distinto), así que el dedup normal no los pilló: los MISMOS
-- 22 cobros (8.459,17€) quedaron DUPLICADOS, inflando el P&L por destino del Dúplex.
--
-- Decisión (Alberto, 23/06/2026): conservar PSD2 (feed vivo + marcador LIQ.OP) y borrar los 22 de Excel
-- del periodo solapado. El histórico anterior a PSD2 (2025 → 22-mar-2026) se queda en Excel (única fuente).
-- BBVA NUNCA da el ordenante real (devuelve el titular), ni siquiera por PSD2: el discriminante fiable
-- de Booking es "LIQ. OP. Nº", no el ordenante. YA APLICADO a la BD compartida por MCP (data, no schema).

WITH psd2 AS (
  SELECT mb.fecha_operacion, mb.importe
  FROM movimientos_bancarios mb
  JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
  WHERE cb.banco ILIKE '%BBVA%' AND mb.origen = 'psd2'
    AND mb.destino = 'turistico_duplex' AND mb.importe > 0
),
dups AS (
  SELECT mb.id,
    row_number() OVER (PARTITION BY mb.fecha_operacion, mb.importe ORDER BY mb.id) AS rn,
    (SELECT count(*) FROM psd2 p WHERE p.fecha_operacion = mb.fecha_operacion AND p.importe = mb.importe) AS psd2_cnt
  FROM movimientos_bancarios mb
  JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
  WHERE cb.banco ILIKE '%BBVA%' AND mb.origen = 'xls-bbva'
    AND mb.destino = 'turistico_duplex' AND mb.importe > 0
)
DELETE FROM movimientos_bancarios
WHERE id IN (SELECT id FROM dups WHERE psd2_cnt > 0 AND rn <= psd2_cnt);
