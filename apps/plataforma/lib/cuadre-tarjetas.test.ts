// node --test --experimental-strip-types lib/cuadre-tarjetas.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mesCiclo, veredictoLiquidacion } from './cuadre-tarjetas.ts'

// Caso real (17/08/2026): la ****0300 se liquidó el 01/08 por 2.013,37€ con las 96 compras
// de julio YA importadas — el check antiguo la ponía en 🔴 porque el recibo espejo del 01/08
// solo llega con el extracto de agosto.
test('desglose del ciclo importado → ✅, no reclama el extracto', () => {
  const v = veredictoLiquidacion({
    fecha: '2026-08-01', importe: -2013.37, pan: '4662032019750300',
    comprasCiclo: 96, sumaCiclo: 1928.7,
  })
  assert.equal(v.nivel, 'ok')
  assert.ok(v.texto.includes('****0300'))
  assert.ok(v.texto.includes('julio de 2026'))
  assert.ok(v.texto.includes('96 compras'))
  assert.ok(v.texto.includes('2.013,37€'))
  assert.ok(v.texto.includes('1.928,70€'))
})

// Caso real hermano: la ****0302 (Pilar) sin las compras de julio → sí falta de verdad,
// y el mes que se pide es el del CICLO (julio), no el de la fecha del cargo (agosto).
test('sin compras del ciclo → 🔴 pidiendo el extracto del mes del ciclo', () => {
  const v = veredictoLiquidacion({
    fecha: '2026-08-01', importe: -629.86, pan: '4662032019650302',
    comprasCiclo: 0, sumaCiclo: 0,
  })
  assert.equal(v.nivel, 'fallo')
  assert.ok(v.texto.includes('****0302'))
  assert.ok(v.texto.includes('julio de 2026'))
  assert.ok(!v.texto.includes('agosto'))
  assert.ok(v.texto.includes('629,86€'))
})

// Sin PAN en el concepto no hay cuenta de tarjeta que mirar: el mensaje declara que no se
// pudo comprobar — no afirma «no lo has subido» (dato que no hay ≠ dato que no se ha mirado).
test('sin PAN → 🔴 pero declarando que no se pudo comprobar', () => {
  const v = veredictoLiquidacion({
    fecha: '2026-08-01', importe: -500, pan: null,
    comprasCiclo: 0, sumaCiclo: 0,
  })
  assert.equal(v.nivel, 'fallo')
  assert.ok(v.texto.includes('no puedo comprobar'))
  assert.ok(!v.texto.includes('No me has subido'))
})

test('mesCiclo: la liquidación del día 1 paga el mes anterior (con cambio de año)', () => {
  assert.deepEqual(mesCiclo('2026-08-01'), { anio: 2026, mes: 7, label: 'julio de 2026' })
  assert.deepEqual(mesCiclo('2026-01-01'), { anio: 2025, mes: 12, label: 'diciembre de 2025' })
  // Liquidación a fin de mes (hipotética): el día anterior sigue en el mismo ciclo.
  assert.deepEqual(mesCiclo('2026-07-31'), { anio: 2026, mes: 7, label: 'julio de 2026' })
})

test('acepta Date además de string', () => {
  const v = veredictoLiquidacion({
    fecha: new Date('2026-08-01T00:00:00Z'), importe: -100, pan: '4662032019750300',
    comprasCiclo: 3, sumaCiclo: 99.5,
  })
  assert.equal(v.nivel, 'ok')
  assert.ok(v.texto.includes('2026-08-01'))
})
