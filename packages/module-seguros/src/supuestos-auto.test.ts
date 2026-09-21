import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KM_ANUALES_SUPUESTOS } from './supuestos-auto.ts'

// 🪤 Cepo de VALOR, no de forma. Los kilómetros al año son factor de tarifa de
// primer orden y viajan en toda cotización de auto que no los declare: subirlos
// o bajarlos mueve el precio de cada presupuesto sin que ninguna pantalla lo
// diga. Que el número esté clavado en un test obliga a que el cambio sea un
// acto deliberado y revisado, no un retoque de paso.
test('el supuesto de kilómetros al año es 15.000 y no cambia por descuido', () => {
  assert.equal(KM_ANUALES_SUPUESTOS, 15000)
})

test('es un entero positivo: el vendor lo rechaza si no', () => {
  assert.ok(Number.isInteger(KM_ANUALES_SUPUESTOS))
  assert.ok(KM_ANUALES_SUPUESTOS > 0)
})
