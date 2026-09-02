import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clientesVisiblesPara,
  explicarAutorizacion,
  relacionesDeFicha,
  tipoInverso,
  tipoRelacion,
  type RelacionFila,
} from './relaciones.ts'

const fila = (p: Partial<RelacionFila> & Pick<RelacionFila, 'id' | 'clienteAId' | 'clienteBId' | 'tipo'>): RelacionFila => ({
  puedeVerPolizas: false,
  observaciones: null,
  ...p,
})

test('tipo inverso: recíprocos, simétricos, pares del volcado y desconocidos', () => {
  assert.equal(tipoInverso('Hijo/a'), 'Padre/Madre')
  assert.equal(tipoInverso('Suegro/a'), 'Nuero/a')
  assert.equal(tipoInverso('Cónyuge/Pareja de Hecho'), 'Cónyuge/Pareja de Hecho')
  assert.equal(tipoInverso('Tomador - Propietario'), 'Propietario - Tomador')
  assert.equal(tipoInverso('lo que sea'), 'lo que sea')
  assert.equal(tipoRelacion('Amigo/a'), 'Amigo/a')
  assert.equal(tipoRelacion('Tomador - Ocasional'), null)
})

test('ficha de José: los dos sentidos se funden, el tipo humano gana al del volcado, y la autorización es direccional', () => {
  const J = 'jose', M = 'maria', S = 'suegra'
  const filas = [
    fila({ id: '1', clienteAId: J, clienteBId: M, tipo: 'Cónyuge/Pareja de Hecho', puedeVerPolizas: true }),
    fila({ id: '2', clienteAId: J, clienteBId: M, tipo: 'Tomador - Propietario' }),
    fila({ id: '3', clienteAId: M, clienteBId: J, tipo: 'Cónyuge/Pareja de Hecho' }),
    fila({ id: '4', clienteAId: M, clienteBId: J, tipo: 'Propietario - Tomador' }),
    fila({ id: '5', clienteAId: S, clienteBId: J, tipo: 'Nuero/a', puedeVerPolizas: true, observaciones: 'vive con ellos' }),
    fila({ id: '6', clienteAId: 'x', clienteBId: 'y', tipo: 'Amigo/a' }),
  ]
  const r = relacionesDeFicha(filas, J)
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], {
    idIda: '1', idVuelta: '3', relacionadoId: M, tipo: 'Cónyuge/Pareja de Hecho',
    autorizaVer: true, puedeVer: false, observaciones: null,
  })
  // Solo hay fila de vuelta (suegra→José «Nuero/a»): desde José ella es su Suegro/a,
  // y como esa fila lleva el flag, José PUEDE ver las pólizas de la suegra.
  assert.deepEqual(r[1], {
    idIda: null, idVuelta: '5', relacionadoId: S, tipo: 'Suegro/a',
    autorizaVer: false, puedeVer: true, observaciones: 'vive con ellos',
  })
  // Desde la ficha de María el mismo vínculo se lee al revés.
  const m = relacionesDeFicha(filas, M)[0]
  assert.equal(m.autorizaVer, false)
  assert.equal(m.puedeVer, true)
  assert.deepEqual(clientesVisiblesPara(filas, M), [J])
  assert.deepEqual(clientesVisiblesPara(filas, J), [S])
})

test('la frase de autorización dice quién ve a quién', () => {
  assert.equal(
    explicarAutorizacion({ autorizaVer: true, puedeVer: false }, 'José', 'María Antonia'),
    'María Antonia puede ver los seguros de José · José no ve los de María Antonia',
  )
})
