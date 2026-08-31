import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluar, MIN_VISTAS, FACTOR_BANDA, type Regla } from './reglas.ts'

const regla = (over: Partial<Regla> = {}): Regla => ({
  fingerprint: 'x', propiedad: 'prop_multi_apartamentos', categoria: 'LIMPIEZA',
  importe_esperado: 100, importe_min: null, importe_max: null, vistas: 1, activa: true, ...over,
})

test('sin regla → bandeja, y el motivo lo dice', () => {
  const v = evaluar({ total: 10 }, null)
  assert.equal(v.decision, 'bandeja')
  assert.match(v.motivo ?? '', /sin regla aprendida/i)
})

test('una regla desactivada no imputa aunque tenga vistas', () => {
  assert.equal(evaluar({ total: 100 }, regla({ activa: false, vistas: 9 })).decision, 'bandeja')
})

test('UNA confirmación basta (29/08/2026): antes hacían falta dos', () => {
  assert.equal(MIN_VISTAS, 1)
  // Es la decisión de Alberto: con la bandeja ya construida, cada `vistas` es un clic suyo, así
  // que exigir dos decisiones humanas idénticas solo repetía trabajo.
  assert.equal(evaluar({ total: 100 }, regla({ vistas: 1 })).decision, 'auto')
  assert.equal(evaluar({ total: 100 }, regla({ vistas: 0 })).decision, 'bandeja')
})

test('la banda ancha deja pasar el importe variable de un servicio', () => {
  // El caso real: Anthropic/Vercel/IONOS facturan suscripción + consumo. Con el ±10 % de antes,
  // 180 € sobre una regla de 100 € volvía a la bandeja cada mes.
  assert.equal(FACTOR_BANDA, 5)
  assert.equal(evaluar({ total: 180 }, regla()).decision, 'auto')
  assert.equal(evaluar({ total: 25 }, regla()).decision, 'auto')
})

test('🚨 pero un importe DESPROPORCIONADO sigue yendo a la bandeja', () => {
  // Lo único que la banda debe proteger: que 900 € donde siempre hubo 100 € no se impute solo.
  const v = evaluar({ total: 900 }, regla())
  assert.equal(v.decision, 'bandeja')
  assert.match(v.motivo ?? '', /fuera de banda/i)
  // Y la propuesta viaja igual, para que revisarlo siga siendo un clic.
  assert.equal(v.propiedad, 'prop_multi_apartamentos')
})

test('un total de 0 o negativo nunca se auto-imputa', () => {
  assert.equal(evaluar({ total: 0 }, regla()).decision, 'bandeja')
  assert.equal(evaluar({ total: null }, regla()).decision, 'bandeja')
})

test('la banda guardada en la regla manda sobre el factor', () => {
  // `reforzarRegla` solo ensancha, así que una banda explícita es histórico real, no un default.
  assert.equal(evaluar({ total: 300 }, regla({ importe_min: 1, importe_max: 200 })).decision, 'bandeja')
  assert.equal(evaluar({ total: 150 }, regla({ importe_min: 1, importe_max: 200 })).decision, 'auto')
})
