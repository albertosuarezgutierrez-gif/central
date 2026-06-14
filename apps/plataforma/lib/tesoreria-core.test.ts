// Tests de la lógica PURA de tesorería. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizarConcepto, detectarRecurrentes, proyectar, type MovTes } from './tesoreria-core.ts'

test('normalizarConcepto: agrupa pese a números/refs distintos', () => {
  assert.equal(normalizarConcepto('RECIBO ESCUELA INFANTIL 0123'), normalizarConcepto('RECIBO ESCUELA INFANTIL 0456'))
  assert.equal(normalizarConcepto('CUOTA PTMO 856289293-5'), 'cuota ptmo')
})

// Gasto mensual de ~300 (3 meses) + ingreso mensual de ~400.
const movs: MovTes[] = [
  { fecha: '2026-01-06', importe: -300, concepto: 'RECIBO ESCUELA INFANTIL 01' },
  { fecha: '2026-02-06', importe: -300, concepto: 'RECIBO ESCUELA INFANTIL 02' },
  { fecha: '2026-03-06', importe: -302, concepto: 'RECIBO ESCUELA INFANTIL 03' },
  { fecha: '2026-01-10', importe: 400, concepto: 'ABONO Booking.com' },
  { fecha: '2026-02-10', importe: 400, concepto: 'ABONO Booking.com' },
  { fecha: '2026-03-10', importe: 400, concepto: 'ABONO Booking.com' },
  { fecha: '2026-02-15', importe: -45, concepto: 'COMPRA puntual no recurrente' },
]

test('detectarRecurrentes: encuentra el gasto y el ingreso mensual, ignora lo puntual', () => {
  const rec = detectarRecurrentes(movs)
  assert.equal(rec.length, 2)
  const gasto = rec.find(r => r.signo === -1)!
  const ingreso = rec.find(r => r.signo === 1)!
  assert.match(gasto.concepto, /ESCUELA INFANTIL/)
  assert.ok(gasto.intervaloDias >= 28 && gasto.intervaloDias <= 31)
  assert.equal(gasto.importeMedio, -300)        // mediana de -300,-300,-302
  assert.equal(ingreso.importeMedio, 400)
})

test('proyectar: a 60 días suma ~2 ocurrencias de cada recurrente', () => {
  const rec = detectarRecurrentes(movs)
  const p = proyectar(1000, rec, 60, '2026-03-11')
  // Desde 11/03: escuela 06/04 y 06/05 (≈2 × 300 = 600 salidas); booking 10/04 y 10/05 (≈2 × 400 = 800 entradas)
  assert.ok(p.salidas >= 590 && p.salidas <= 610)
  assert.ok(p.entradas >= 790 && p.entradas <= 810)
  assert.equal(p.proyectado, 1000 + p.entradas - p.salidas)
})
