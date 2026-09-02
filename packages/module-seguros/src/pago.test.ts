import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etiquetaFormaPago, etiquetaFraccionamiento, recargoFraccionamiento, ventanaAnulacion } from './pago.ts'

const rec = (importe: number, fecha: string, situacion = 'cobrado') => ({ importe, fechaEmision: fecha, situacion })

test('pago anual: no hay recargo que calcular', () => {
  assert.deepEqual(recargoFraccionamiento({ fraccionamiento: 'anual', primaAnual: 400, vencimiento: '2026-10-05', recibos: [] }), { estado: 'no_aplica' })
})

test('semestral con los dos recibos del ciclo: el recargo es la diferencia', () => {
  const r = recargoFraccionamiento({
    fraccionamiento: 'semestral', primaAnual: 400, vencimiento: '2026-10-05',
    recibos: [rec(210, '2025-10-05'), rec(210, '2026-04-05')],
  })
  assert.equal(r.estado, 'calculado')
  if (r.estado !== 'calculado') return
  assert.equal(r.recargoEur, 20)
  assert.equal(r.recargoPct, 5)
  assert.equal(r.recibos, 2)
})

test('🚨 ciclo incompleto NO da un número: la resta saldría negativa y falsa', () => {
  const r = recargoFraccionamiento({
    fraccionamiento: 'trimestral', primaAnual: 400, vencimiento: '2026-10-05',
    recibos: [rec(105, '2025-10-05'), rec(105, '2026-01-05')],
  })
  assert.equal(r.estado, 'sin_datos')
  if (r.estado !== 'sin_datos') return
  assert.match(r.motivo, /2 de 4/)
})

test('los recibos anulados y los de otro ciclo no cuentan', () => {
  const r = recargoFraccionamiento({
    fraccionamiento: 'semestral', primaAnual: 400, vencimiento: '2026-10-05',
    recibos: [rec(210, '2025-10-05'), rec(210, '2026-04-05'), rec(210, '2026-04-05', 'anulado'), rec(210, '2024-10-05')],
  })
  assert.equal(r.estado, 'calculado')
  if (r.estado !== 'calculado') return
  assert.equal(r.recibos, 2)
})

test('sin prima anual o sin forma de pago: se dice, no se inventa', () => {
  assert.equal(recargoFraccionamiento({ fraccionamiento: null, primaAnual: 400, vencimiento: '2026-10-05', recibos: [] }).estado, 'sin_datos')
  assert.equal(recargoFraccionamiento({ fraccionamiento: 'semestral', primaAnual: null, vencimiento: '2026-10-05', recibos: [] }).estado, 'sin_datos')
})

test('recibos que suman MENOS que la prima anual no cuadran: sin datos', () => {
  const r = recargoFraccionamiento({
    fraccionamiento: 'semestral', primaAnual: 500, vencimiento: '2026-10-05',
    recibos: [rec(210, '2025-10-05'), rec(210, '2026-04-05')],
  })
  assert.equal(r.estado, 'sin_datos')
})

test('etiquetas: fraccionamiento y forma de cobro EIAC', () => {
  assert.equal(etiquetaFraccionamiento('semestral'), 'semestral')
  assert.equal(etiquetaFraccionamiento(null), 'no informado')
  assert.equal(etiquetaFormaPago('CC'), 'domiciliado')
  assert.equal(etiquetaFormaPago('OF'), 'en oficina')
  assert.equal(etiquetaFormaPago(null), null)
})

test('la única salida es el vencimiento, avisando 30 días antes', () => {
  const v = ventanaAnulacion('2026-10-05', new Date('2026-09-02T00:00:00Z'))
  assert.equal(v?.limiteAviso, '2026-09-05')
  assert.equal(v?.diasParaAvisar, 3)
  assert.equal(v?.enPlazo, true)
  const tarde = ventanaAnulacion('2026-10-05', new Date('2026-09-10T00:00:00Z'))
  assert.equal(tarde?.enPlazo, false)
  assert.equal(ventanaAnulacion(null), null)
})
