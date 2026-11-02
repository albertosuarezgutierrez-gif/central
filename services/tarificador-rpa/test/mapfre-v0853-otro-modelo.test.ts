import test from 'node:test'
import assert from 'node:assert/strict'
import { filaVehiculoPorEquivalencia, mapfreAuto } from '../src/adapters/mapfre/auto.ts'

const REF = { origen: 'humano', marca: 'SMART', modelo: 'Fortwo', version: 'PURE 52', carroceria: null, puertas: null, cc: null, cv: 71, combustible: 'gasolina', anio: null } as const
const FORFOUR = { denominacion: 'SMART FORFOUR PURE 1.1', cvKw: '75', cc: '1124', puertas: '5', fechaInicio: '01/2015' }
const FORTWO = { denominacion: 'SMART FORTWO PURE 52', cvKw: '71', cc: '999', puertas: '3', fechaInicio: '01/2015' }

test('v0.8.53 · la versión del bot es 0.8.55', () => assert.equal(mapfreAuto.version, '0.8.55'))

test('v0.8.55 · fila ÚNICA de otro modelo que la referencia humana: se tarifica con ella y se avisa (supuesto), ya no para', () => {
  const r = filaVehiculoPorEquivalencia([FORFOUR], { vehiculoReferencia: REF })
  assert.equal(r.indice, 0)
  assert.match(r.supuesto ?? '', /Modelo distinto del de referencia/)
  assert.match(r.supuesto ?? '', /FORFOUR/)
  assert.match(r.supuesto ?? '', /Mapfre no ofrece/)
  assert.match(r.supuesto ?? '', /supuesto/)
  assert.doesNotMatch(r.supuesto ?? '', /,/)
})

test('v0.8.55 · varias filas, todas de otro modelo: elige la más parecida (CV/cc/acabado) con aviso', () => {
  const ref = { ...REF, modelo: 'Forfour', version: 'PURE 1.1', cv: 75, cc: 1124 }
  const r = filaVehiculoPorEquivalencia([{ ...FORTWO, denominacion: 'SMART FORTWO PASSION 52', cvKw: '52', cc: '999' }, { ...FORTWO, denominacion: 'SMART FORTWO PURE 52', cvKw: '71', cc: '999' }], { vehiculoReferencia: ref })
  assert.equal(r.indice, 1)
  assert.match(r.supuesto ?? '', /Modelo distinto del de referencia/)
  assert.match(r.supuesto ?? '', /Mapfre no ofrece/)
})

test('v0.8.53 · varias filas: se descarta la de otro modelo y se elige la del mismo', () => {
  const r = filaVehiculoPorEquivalencia([FORFOUR, FORTWO], { vehiculoReferencia: REF })
  assert.equal(r.indice, 1)
})

test('v0.8.53 · sin referencia, o con referencia propia de Mapfre: se conserva el comportamiento anterior', () => {
  assert.equal(filaVehiculoPorEquivalencia([FORFOUR], null).indice, 0)
  assert.equal(filaVehiculoPorEquivalencia([FORFOUR], { vehiculoReferencia: { ...REF, origen: 'mapfre' } }).indice, 0)
})

// v0.8.54 · caso real (trabajo de Smart Forfour con referencia humana Fortwo): el riesgo traía `eleccionVersion` con la fila Forfour y la 0.8.53 la dejó pasar.
test('v0.8.54/55 · eleccionVersion ya puesta con la fila de OTRO modelo: se respeta la elección y se avisa del modelo distinto', () => {
  const eleccionVersion = { codigo: null, etiqueta: 'Smart Forfour Pure 1.1 · 75 CV · 1124 cc · 01/03/2005' }
  const r = filaVehiculoPorEquivalencia([{ denominacion: 'Smart Forfour Pure 1.1', cvKw: '75', cc: '1124', puertas: '5', fechaInicio: '01/03/2005' }], { vehiculoReferencia: REF, eleccionVersion })
  assert.equal(r.indice, 0)
  assert.match(r.supuesto ?? '', /Modelo distinto del de referencia/)
  assert.equal(filaVehiculoPorEquivalencia([FORFOUR, FORTWO], { vehiculoReferencia: REF, eleccionVersion: { codigo: null, etiqueta: 'SMART FORFOUR PURE 1.1 · 75 CV · 1124 cc · 01/2015' } }).indice, 1)
  // la elección del MISMO modelo sigue valiendo
  assert.equal(filaVehiculoPorEquivalencia([FORFOUR, FORTWO], { vehiculoReferencia: REF, eleccionVersion: { codigo: null, etiqueta: 'SMART FORTWO PURE 52 · 71 CV · 999 cc · 01/2015' } }).indice, 1)
})
