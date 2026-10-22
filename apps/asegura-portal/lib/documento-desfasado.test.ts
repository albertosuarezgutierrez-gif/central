import { test } from 'node:test'
import assert from 'node:assert/strict'

import { documentoDesfasado, motivosDesfase } from './documento-desfasado.ts'

// `hoy` siempre inyectado: nada contra el reloj real.
const HOY = '2026-10-22'

test('vencida: vencimiento leído anterior a hoy', () => {
  assert.deepEqual(motivosDesfase({ fechaVencimiento: '2025-03-01', primaAnual: 300 }, HOY), ['vencida'])
  assert.equal(documentoDesfasado({ fechaVencimiento: '2025-03-01', primaAnual: 300 }, HOY), true)
})

test('sin prima: no leída aunque el vencimiento sea futuro', () => {
  assert.deepEqual(motivosDesfase({ fechaVencimiento: '2027-03-01', primaAnual: null }, HOY), ['sin_prima'])
})

test('al día: vencimiento futuro (o hoy) y prima presente', () => {
  assert.equal(documentoDesfasado({ fechaVencimiento: '2027-03-01', primaAnual: 450.5 }, HOY), false)
  assert.equal(documentoDesfasado({ fechaVencimiento: HOY, primaAnual: 450.5 }, HOY), false)
})

test('vencimiento null con prima presente: no se afirma que esté desfasado', () => {
  assert.equal(documentoDesfasado({ fechaVencimiento: null, primaAnual: 450.5 }, HOY), false)
})

test('prima 0 es un dato, no «no leída»; vencida y sin prima suman dos motivos', () => {
  assert.equal(documentoDesfasado({ fechaVencimiento: '2027-01-01', primaAnual: 0 }, HOY), false)
  assert.deepEqual(motivosDesfase({ fechaVencimiento: '2020-01-01', primaAnual: null }, HOY), ['vencida', 'sin_prima'])
})
