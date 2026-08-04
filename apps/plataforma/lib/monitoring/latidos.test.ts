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
  assert.match(r.motivo, /ni una sola ejecución/)
})

// Las dos averías que antes se confundían en un mismo «sin ninguna señal» (31/07/2026:
// el escaneo de facturas corría a diario y moría en 504 antes de escribir su huella).
test('se ejecuta pero nunca completa → alerta que lo dice, no «sin señal»', () => {
  const r = evaluarLatido({
    ahora,
    ultimo: null,
    ultimoIntento: new Date('2026-07-21T06:15:00Z'),
    maxHoras: 30,
    detalle: 'pasada en curso — aún sin completar',
  })
  assert.equal(r.alerta, true)
  assert.equal(r.horas, null)
  assert.match(r.motivo, /NUNCA completa/)
  assert.match(r.motivo, /1\.8 h/)
  assert.doesNotMatch(r.motivo, /ni una sola ejecución/)
  assert.match(r.motivo, /pasada en curso/)
})

test('pasada buena vieja pero sigue arrancando → se dice que no termina', () => {
  const r = evaluarLatido({
    ahora,
    ultimo: new Date('2026-07-10T08:00:00Z'),
    ultimoIntento: new Date('2026-07-21T06:15:00Z'),
    maxHoras: 30,
  })
  assert.equal(r.alerta, true)
  assert.match(r.motivo, /SÍ arrancó/)
})

test('pasada buena fresca → sin alerta aunque el intento sea el mismo', () => {
  const t = new Date('2026-07-21T06:15:00Z')
  const r = evaluarLatido({ ahora, ultimo: t, ultimoIntento: t, maxHoras: 30 })
  assert.equal(r.alerta, false)
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
