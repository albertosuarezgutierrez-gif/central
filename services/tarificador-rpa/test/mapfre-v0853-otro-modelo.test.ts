import test from 'node:test'
import assert from 'node:assert/strict'
import { filaVehiculoPorEquivalencia, ErrorOtroModeloMapfre, mapfreAuto } from '../src/adapters/mapfre/auto.ts'
import { ErrorEleccionVersion } from '../src/adapters/allianz/auto.ts'

const REF = { origen: 'humano', marca: 'SMART', modelo: 'Fortwo', version: 'PURE 52', carroceria: null, puertas: null, cc: null, cv: 71, combustible: 'gasolina', anio: null } as const
const FORFOUR = { denominacion: 'SMART FORFOUR PURE 1.1', cvKw: '75', cc: '1124', puertas: '5', fechaInicio: '01/2015' }
const FORTWO = { denominacion: 'SMART FORTWO PURE 52', cvKw: '71', cc: '999', puertas: '3', fechaInicio: '01/2015' }

test('v0.8.53 · la versión del bot es 0.8.54', () => assert.equal(mapfreAuto.version, '0.8.54'))

test('v0.8.53 · fila ÚNICA de otro modelo que la referencia humana: no se tarifica (ErrorEleccionVersion con ambos modelos, sin matrícula)', () => {
  assert.throws(
    () => filaVehiculoPorEquivalencia([FORFOUR], { vehiculoReferencia: REF }),
    (e) => e instanceof ErrorOtroModeloMapfre && e instanceof ErrorEleccionVersion && /FORFOUR/.test(e.message) && /Fortwo/i.test(e.message) && !/matr[ií]cula\s+\w{4,}/i.test(e.message),
  )
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
test('v0.8.54 · eleccionVersion ya puesta con la fila de OTRO modelo: no se tarifica (ErrorOtroModeloMapfre)', () => {
  const eleccionVersion = { codigo: null, etiqueta: 'Smart Forfour Pure 1.1 · 75 CV · 1124 cc · 01/03/2005' }
  assert.throws(
    () => filaVehiculoPorEquivalencia([{ denominacion: 'Smart Forfour Pure 1.1', cvKw: '75', cc: '1124', puertas: '5', fechaInicio: '01/03/2005' }], { vehiculoReferencia: REF, eleccionVersion }),
    (e) => e instanceof ErrorOtroModeloMapfre && /Forfour/i.test(e.message) && /Fortwo/i.test(e.message),
  )
  assert.equal(filaVehiculoPorEquivalencia([FORFOUR, FORTWO], { vehiculoReferencia: REF, eleccionVersion: { codigo: null, etiqueta: 'SMART FORFOUR PURE 1.1 · 75 CV · 1124 cc · 01/2015' } }).indice, 1)
  // la elección del MISMO modelo sigue valiendo
  assert.equal(filaVehiculoPorEquivalencia([FORFOUR, FORTWO], { vehiculoReferencia: REF, eleccionVersion: { codigo: null, etiqueta: 'SMART FORTWO PURE 52 · 71 CV · 999 cc · 01/2015' } }).indice, 1)
})
