-- Protección del Booking histórico del Dúplex (23/06/2026, follow-up del dedup LIQ.OP).
--
-- Problema: la sesión #444 fijó destino='turistico_duplex' por SQL en los abonos de BBVA
-- "Transferencia recibida" (Booking del Dúplex), pero SIN marcar analizado_at/destino_confirmado.
-- Al cambiar la regla de clasificación (PR #448: "Transferencia recibida" a secas → personal +
-- revisar, porque BBVA no da el ordenante), el cron de categorización REPROCESABA esos abonos
-- (analizado_at IS NULL) y los movía de Dúplex → personal, deshaciendo la decisión del dueño.
--
-- Arreglo (data): re-confirmar como Booking del Dúplex TODOS los abonos históricos de BBVA con
-- concepto exacto "transferencia recibida" y marcarlos analizado_at + destino_confirmado para que
-- el cron no vuelva a tocarlos. El arreglo de CÓDIGO (lib/categorizar.ts) ya respeta cualquier
-- destino_confirmado, así que esto no puede repetirse. YA APLICADO por MCP a la BD compartida.

UPDATE movimientos_bancarios mb
SET destino = 'turistico_duplex',
    requiere_revision = false,
    destino_confirmado = true,
    analizado_at = COALESCE(mb.analizado_at, now())
FROM cuentas_bancarias cb
WHERE cb.id = mb.cuenta_bancaria_id
  AND cb.banco ILIKE '%BBVA%' AND mb.origen = 'xls-bbva' AND mb.importe > 0
  AND lower(mb.concepto) = 'transferencia recibida';

-- Excepción puntual: el abono del 2026-01-07 de 1.148,85€ NO es Booking (era 'personal' en el
-- estado aprobado en #446; un único traspaso grande, no un payout de Booking). El UPDATE anterior,
-- al ser un barrido por concepto, lo había arrastrado a Dúplex; se devuelve a personal.
UPDATE movimientos_bancarios
SET destino = 'personal', destino_confirmado = true, requiere_revision = false
WHERE id = 'e6587d3a-6faf-41a1-84d4-62fcbc9edfa9'
  AND importe = 1148.85 AND lower(concepto) = 'transferencia recibida';
