import test from 'node:test'
import assert from 'node:assert/strict'
import { textoPorQueSale } from './por-que-sale.ts'

test('línea completa: ramo, compañía, fecha estimada y días', () => {
  assert.equal(
    textoPorQueSale({ ramo: 'Auto', aseguradora: 'Plus Ultra', vencimientoEstimado: '2026-10-10', dias: 5 }),
    'Auto · con Plus Ultra · vence 10/10 (estimada, nadie la ha confirmado) · en 5 días',
  )
})

test('lo que no consta se omite o se dice, no se inventa', () => {
  const t = textoPorQueSale({ ramo: null, aseguradora: '  ', vencimientoEstimado: '2026-06-01', dias: 1 })
  assert.equal(t, 'ramo sin dato · vence 01/06 (estimada, nadie la ha confirmado) · en 1 día')
  assert.ok(!t.includes('con '))
})

test('fecha ilegible y vence hoy', () => {
  assert.equal(textoPorQueSale({ ramo: 'Hogar', aseguradora: null, vencimientoEstimado: 'x', dias: 0 }), 'Hogar · vencimiento ilegible · hoy')
})
