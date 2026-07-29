import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarLatido, AGENTES_VIGILADOS } from './latidos.ts'

const ahora = new Date('2026-07-21T08:00:00Z')

test('huella fresca → sin alerta', () => {
  const r = evaluarLatido({ ahora, ultimo: new Date('2026-07-21T06:00:00Z'), maxHoras: 6 })
  assert.equal(r.alerta, false)
  assert.ok(r.horas !== null && r.horas < 6)
})

test('huella vieja pasado el umbral → alerta', () => {
  const r = evaluarLatido({ ahora, ultimo: new Date('2026-07-01T00:00:00Z'), maxHoras: 192 })
  assert.equal(r.alerta, true)
  assert.ok(r.horas !== null && r.horas > 192)
})

test('sin ninguna señal → alerta', () => {
  const r = evaluarLatido({ ahora, ultimo: null, maxHoras: 6 })
  assert.equal(r.alerta, true)
  assert.equal(r.horas, null)
})

test('justo en el umbral no alerta; un minuto más allá sí', () => {
  const justo = new Date(ahora.getTime() - 6 * 3_600_000)
  assert.equal(evaluarLatido({ ahora, ultimo: justo, maxHoras: 6 }).alerta, false)
  const pasado = new Date(justo.getTime() - 60_000)
  assert.equal(evaluarLatido({ ahora, ultimo: pasado, maxHoras: 6 }).alerta, true)
})

test('el registro tiene ids únicos y umbrales positivos', () => {
  const ids = AGENTES_VIGILADOS.map(a => a.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const a of AGENTES_VIGILADOS) assert.ok(a.maxHoras > 0, `${a.id} debe tener umbral > 0`)
})
