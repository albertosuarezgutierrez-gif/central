import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claveParNoDuplicado,
  grupoResueltoNoDuplicado,
  gruposVivosDuplicados,
  numeroPolizaComparable,
  polizasDuplicadas,
  type PolizaParaDuplicados,
  type PolizaParaVigiaDuplicadas,
} from './duplicados.ts'

// ── «No es duplicado» (04/10/2026) ──────────────────────────────────────────
// Allianz 32742526 y 35374290: dos fichas vivas con el mismo número y la misma
// compañía, de clientes distintos, que son pólizas distintas de verdad. Sin una
// marca, salían para siempre en la pantalla y en el vigía.

test('claveParNoDuplicado: el par es el mismo en los dos sentidos', () => {
  assert.equal(claveParNoDuplicado('b', 'a'), 'a|b')
  assert.equal(claveParNoDuplicado('a', 'b'), 'a|b')
  assert.equal(claveParNoDuplicado('a', 'a'), null)
  assert.equal(claveParNoDuplicado(null, 'a'), null)
  assert.equal(claveParNoDuplicado('', 'a'), null)
})

test('grupoResueltoNoDuplicado: un trío con UN par marcado sigue abierto', () => {
  const marcas = new Set([claveParNoDuplicado('a', 'b')!])
  assert.equal(grupoResueltoNoDuplicado(['a', 'b'], marcas), true)
  assert.equal(grupoResueltoNoDuplicado(['a', 'b', 'c'], marcas), false)
  const todas = new Set(['a|b', 'a|c', 'b|c'])
  assert.equal(grupoResueltoNoDuplicado(['c', 'a', 'b'], todas), true)
  assert.equal(grupoResueltoNoDuplicado(['a', 'b'], null), false)
  assert.equal(grupoResueltoNoDuplicado(['a', 'b'], new Set()), false)
})

const viva = (id: string, numero: string, clienteId = `cli-${id}`): PolizaParaDuplicados => ({
  id, clienteId, numeroPoliza: numero, codigoEntidadDgs: 'C0109', aseguradora: 'Allianz',
  viva: true, confirmadaCima: true, estado: 'activa',
})

test('🚨 pantalla: el par marcado «no duplicado» deja de salir; el resto sigue', () => {
  const polizas = [viva('p1', '32742526'), viva('p2', '032742526'), viva('p3', '35374290'), viva('p4', '35374290')]
  assert.equal(polizasDuplicadas(polizas).length, 2)
  const marcas = new Set([claveParNoDuplicado('p2', 'p1')!])
  const g = polizasDuplicadas(polizas, marcas)
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].polizas.map((p) => p.id).sort(), ['p3', 'p4'])
})

test('pantalla: sin marcas (o marcas sin leer) se comporta como siempre', () => {
  const polizas = [viva('p1', '32742526'), viva('p2', '32742526')]
  assert.equal(polizasDuplicadas(polizas).length, 1)
  assert.equal(polizasDuplicadas(polizas, null).length, 1)
})

// ── Vigía: criterio de «mismo número» ───────────────────────────────────────

test('numeroPolizaComparable: sin separadores ni ceros a la izquierda, en mayúsculas', () => {
  assert.equal(numeroPolizaComparable(' 0035-374.290 '), '35374290')
  assert.equal(numeroPolizaComparable('uvg4/123'), 'UVG4123')
  assert.equal(numeroPolizaComparable(null), null)
})

test('🚨 numeroPolizaComparable: un comodín NO es un número (seis «pendiente» en Mapfre no son una póliza seis veces)', () => {
  for (const c of ['pendiente', 'Pendiente', 'PENDIENTE', 'sin número', 'S/N', '12345', '00000', '0000012', 'XXXXXXX', 'ABCDEFG', '1111111']) {
    assert.equal(numeroPolizaComparable(c), null, c)
  }
})

const fila = (id: string, numero: string | null, dgs: string | null = 'C0109', correduriaId = 'cor-1'): PolizaParaVigiaDuplicadas =>
  ({ id, correduriaId, numeroPoliza: numero, codigoEntidadDgs: dgs })

test('vigía: agrupa por DGS + número comparable y devuelve el id más bajo como ref', () => {
  const g = gruposVivosDuplicados([
    fila('b2', '35374290'), fila('a1', '0035374290'),
    fila('c3', '30210000', 'C0613'), fila('d4', '30210000', 'C0613'), fila('e5', '30210000', 'C0613'),
    fila('f6', '99999123'),
  ])
  assert.deepEqual(g, [
    { entidad: 'C0109', ref: 'a1', fichas: 2 },
    { entidad: 'C0613', ref: 'c3', fichas: 3 },
  ])
})

test('vigía: misma cifra en OTRA compañía, sin DGS, comodín u OTRA correduría → no es grupo', () => {
  assert.deepEqual(gruposVivosDuplicados([fila('a', '35374290', 'C0109'), fila('b', '35374290', 'C0058')]), [])
  assert.deepEqual(gruposVivosDuplicados([fila('a', '35374290', null), fila('b', '35374290', null)]), [])
  assert.deepEqual(gruposVivosDuplicados([fila('a', 'pendiente'), fila('b', 'pendiente')]), [])
  // Multi-tenant: dos corredurías no se funden jamás.
  assert.deepEqual(gruposVivosDuplicados([fila('a', '35374290', 'C0109', 'cor-1'), fila('b', '35374290', 'C0109', 'cor-2')]), [])
})

test('🚨 vigía: el grupo con todos sus pares marcados «no duplicado» desaparece', () => {
  const filas = [fila('a', '32742526'), fila('b', '32742526'), fila('c', '35374290'), fila('d', '35374290')]
  assert.equal(gruposVivosDuplicados(filas).length, 2)
  const g = gruposVivosDuplicados(filas, new Set([claveParNoDuplicado('b', 'a')!]))
  assert.deepEqual(g, [{ entidad: 'C0109', ref: 'c', fichas: 2 }])
})

test('vigía: un id repetido (dos filas de la misma ficha) no fabrica un duplicado', () => {
  assert.deepEqual(gruposVivosDuplicados([fila('a', '32742526'), fila('a', '32742526')]), [])
})
