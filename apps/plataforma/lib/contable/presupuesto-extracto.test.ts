// apps/plataforma/lib/contable/presupuesto-extracto.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planificarPasos, lineaSaltados, RESERVA_RESPUESTA_MS } from './presupuesto-extracto.ts'

test('con tiempo de sobra caben todos los pasos', () => {
  const p = planificarPasos(300_000)
  assert.deepEqual(p.hacer, { telegram: true, vigilantes: true, drive: true, gmail: true })
  assert.deepEqual(p.saltados, [])
})

// Lo primero que se suelta es lo que otro proceso recoge después (el cron de facturas), no el aviso.
test('cuando aprieta, se sueltan de abajo arriba', () => {
  // 160 s: entran el aviso (90) y los vigilantes (40); los 30 que quedan no dan para Drive ni Gmail
  // dejando la reserva de respuesta.
  const p = planificarPasos(160_000)
  assert.equal(p.hacer.telegram, true)
  assert.equal(p.hacer.vigilantes, true)
  assert.deepEqual(p.saltados, ['drive', 'gmail'])

  // Con 190 s ya cabe todo menos Gmail, que es lo único que otro proceso recoge solo.
  assert.deepEqual(planificarPasos(190_000).saltados, ['gmail'])
})

test('sin tiempo no se hace nada opcional: la respuesta va primero', () => {
  const p = planificarPasos(RESERVA_RESPUESTA_MS)
  assert.deepEqual(p.hacer, { telegram: false, vigilantes: false, drive: false, gmail: false })
  assert.deepEqual(p.saltados, ['telegram', 'vigilantes', 'drive', 'gmail'])
})

test('un presupuesto ya agotado (o negativo) no revienta ni cuela pasos', () => {
  const p = planificarPasos(-5_000)
  assert.equal(Object.values(p.hacer).some(Boolean), false)
  assert.equal(p.saltados.length, 4)
})

test('siempre queda la reserva para responder', () => {
  for (const ms of [0, 20_000, 90_000, 140_000, 200_000, 400_000]) {
    const { hacer } = planificarPasos(ms)
    const gastado = (hacer.telegram ? 90_000 : 0) + (hacer.vigilantes ? 40_000 : 0)
      + (hacer.drive ? 30_000 : 0) + (hacer.gmail ? 20_000 : 0)
    assert.ok(ms - gastado >= RESERVA_RESPUESTA_MS || gastado === 0, `ms=${ms}`)
  }
})

test('lo saltado se DICE (y con qué hacer), no se calla', () => {
  assert.equal(lineaSaltados([]), '')
  const t = lineaSaltados(['drive', 'gmail'])
  assert.match(t, /No me dio tiempo/)
  assert.match(t, /Drive/)
  assert.match(t, /reimportar no duplica/)
  assert.match(t, /cron de esta noche/)
})
