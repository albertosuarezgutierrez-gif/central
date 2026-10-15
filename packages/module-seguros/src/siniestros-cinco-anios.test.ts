import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exigeSiniestrosUltimos5 } from './siniestros-cinco-anios.ts'

test('exigeSiniestrosUltimos5: <5 años limpio y distinto de los asegurados → se exige', () => {
  assert.equal(exigeSiniestrosUltimos5({ aseguradoAntes: true, aniosAsegurado: 10, aniosSinSiniestros: 3 }), true)
})

test('exigeSiniestrosUltimos5: la excepción «años sin siniestros = años asegurado» NO lo exige (nunca tuvo uno)', () => {
  assert.equal(exigeSiniestrosUltimos5({ aseguradoAntes: true, aniosAsegurado: 3, aniosSinSiniestros: 3 }), false)
  assert.equal(exigeSiniestrosUltimos5({ aseguradoAntes: true, aniosAsegurado: 0, aniosSinSiniestros: 0 }), true, '0 = 0 es «no hay dato», no «limpio»')
})

test('exigeSiniestrosUltimos5: sin seguro anterior, sin dato o con 5+ años limpio, no', () => {
  assert.equal(exigeSiniestrosUltimos5({ aseguradoAntes: false, aniosAsegurado: 10, aniosSinSiniestros: 3 }), false)
  assert.equal(exigeSiniestrosUltimos5({ aseguradoAntes: true, aniosAsegurado: 10, aniosSinSiniestros: null }), false)
  assert.equal(exigeSiniestrosUltimos5({ aseguradoAntes: true, aniosAsegurado: 10, aniosSinSiniestros: Number.NaN }), false)
  assert.equal(exigeSiniestrosUltimos5({ aseguradoAntes: true, aniosAsegurado: 18, aniosSinSiniestros: 5 }), false)
})
