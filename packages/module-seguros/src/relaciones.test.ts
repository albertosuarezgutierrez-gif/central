import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SIN_VINCULO,
  clientesVisiblesPara,
  explicarAutorizacion,
  permiteAutorizar,
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

// ── «Revisado y no son nada» ≠ «nadie lo ha mirado» (03/09/2026) ─────────────

test('«Sin vínculo» es un tipo válido y su inverso es él mismo', () => {
  // Alberto, sobre Antonio Sevico (conductor ocasional en dos pólizas de José):
  // «no tiene vinculación ninguna». Eso es un HECHO revisado, y hasta hoy no
  // había forma de anotarlo: se veía igual que no haberlo mirado nunca.
  assert.equal(tipoRelacion(SIN_VINCULO), SIN_VINCULO)
  assert.equal(tipoInverso(SIN_VINCULO), SIN_VINCULO)
})

test('«Sin vínculo» NO autoriza a ver seguros, ni con el flag puesto', () => {
  assert.equal(permiteAutorizar(SIN_VINCULO), false)
  assert.equal(permiteAutorizar('Cónyuge/Pareja de Hecho'), true)
  // La guarda vive en el punto donde se decide el acceso, no solo en el botón:
  // una fila «Sin vínculo» con `puedeVerPolizas` a true (un dato viejo, un
  // volcado, un error) no puede abrir las pólizas de nadie.
  const filas: RelacionFila[] = [
    fila({ id: '1', clienteAId: 'conductor', clienteBId: 'jose', tipo: SIN_VINCULO, puedeVerPolizas: true }),
    fila({ id: '2', clienteAId: 'conyuge', clienteBId: 'jose', tipo: 'Cónyuge/Pareja de Hecho', puedeVerPolizas: true }),
  ]
  assert.deepEqual(clientesVisiblesPara(filas, 'jose'), ['conyuge'])
})

test('un «Sin vínculo» se lee desde la ficha como cualquier otro vínculo', () => {
  const filas: RelacionFila[] = [
    fila({ id: '1', clienteAId: 'jose', clienteBId: 'antonio', tipo: SIN_VINCULO }),
    fila({ id: '2', clienteAId: 'antonio', clienteBId: 'jose', tipo: SIN_VINCULO }),
  ]
  const r = relacionesDeFicha(filas, 'jose')
  assert.equal(r.length, 1)
  assert.equal(r[0].tipo, SIN_VINCULO)
  assert.equal(r[0].autorizaVer, false)
})
