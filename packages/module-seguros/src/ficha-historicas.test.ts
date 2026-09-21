import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparHistoricas, type HistoricaAgrupable } from './ficha-historicas.ts'

const BASE: HistoricaAgrupable = {
  id: 'x',
  tipo: 'auto',
  aseguradora: '(legacy)',
  numeroPoliza: null,
  estado: 'en_renovacion',
  fechaVencimiento: '2023-10-07',
  prima: 201,
  bien: 'mat:3935GPY',
}

const fila = (p: Partial<HistoricaAgrupable> & { id: string }): HistoricaAgrupable => ({ ...BASE, ...p })

test('el caso real: dos filas del volcado que solo difieren en la prima son UNA línea', () => {
  // FORD FOCUS 3935GPY: `asegura_app:pol2:14569` (201€) y `:15128` (210€).
  const g = agruparHistoricas([fila({ id: 'a', prima: 201 }), fila({ id: 'b', prima: 210 })])
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].filas.map(f => f.id), ['a', 'b'])
  assert.deepEqual(g[0].primas, [201, 210], 'las DOS primas se enseñan: no se elige una')
  assert.equal(g[0].poliza.id, 'a', 'se pinta la primera del orden de entrada')
})

test('no se pierde ninguna fila: la suma de los grupos es la entrada', () => {
  const entrada = [
    fila({ id: 'a', prima: 201 }),
    fila({ id: 'b', prima: 210 }),
    fila({ id: 'c', bien: 'mat:0000AAA' }),
    fila({ id: 'd', bien: null }),
  ]
  const g = agruparHistoricas(entrada)
  assert.deepEqual(g.flatMap(x => x.filas.map(f => f.id)).sort(), ['a', 'b', 'c', 'd'])
})

test('un bien distinto NO se agrupa aunque coincida todo lo demás', () => {
  const g = agruparHistoricas([fila({ id: 'a' }), fila({ id: 'b', bien: 'mat:0000AAA' })])
  assert.equal(g.length, 2)
})

test('el bien desconocido va SOLO: no se funde lo que no se puede distinguir', () => {
  const g = agruparHistoricas([fila({ id: 'a', bien: null }), fila({ id: 'b', bien: null })])
  assert.equal(g.length, 2, 'dos «no se sabe» no son dos iguales')
  assert.ok(g.every(x => x.bienDesconocido))
})

test('vencimiento, estado, compañía y número forman parte de la identidad', () => {
  const pares: Partial<HistoricaAgrupable>[] = [
    { fechaVencimiento: '2024-10-07' },
    { fechaVencimiento: null },
    { estado: 'vencida' },
    { aseguradora: 'REALE' },
    { numeroPoliza: '14656587' },
    { tipo: 'hogar' },
  ]
  for (const p of pares) {
    const g = agruparHistoricas([fila({ id: 'a' }), fila({ id: 'b', ...p })])
    assert.equal(g.length, 2, `${JSON.stringify(p)} debería partir el grupo`)
  }
})

test('sin fecha de vencimiento las filas iguales SÍ se agrupan entre sí', () => {
  const g = agruparHistoricas([
    fila({ id: 'a', fechaVencimiento: null, prima: 96 }),
    fila({ id: 'b', fechaVencimiento: null, prima: 65 }),
  ])
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].primas, [65, 96])
})

test('«sin dato» de prima no se cuenta como 0€ y se declara aparte', () => {
  const g = agruparHistoricas([fila({ id: 'a', prima: null }), fila({ id: 'b', prima: 210 })])
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].primas, [210])
  assert.equal(g[0].algunaSinPrima, true)
  assert.equal(g[0].primas.includes(0), false)
})

test('la prima repetida no se enseña dos veces', () => {
  const g = agruparHistoricas([fila({ id: 'a', prima: 96 }), fila({ id: 'b', prima: 96 })])
  assert.deepEqual(g[0].primas, [96])
  assert.equal(g[0].filas.length, 2, 'pero las dos filas siguen contadas')
})

test('el caso real de hogar: cuatro filas, dos precios, una línea', () => {
  // cp 29679, vence 2023-12-12: `pol2:14733`/`15190` a 96€ y `14734`/`15191` a 65€.
  const hogar = (id: string, prima: number) =>
    fila({ id, tipo: 'hogar', prima, bien: 'ESTEPONA · CP 29679§249 m² · construida en 2005' })
  const g = agruparHistoricas([hogar('a', 96), hogar('b', 65), hogar('c', 96), hogar('d', 65)])
  assert.equal(g.length, 1)
  assert.equal(g[0].filas.length, 4)
  assert.deepEqual(g[0].primas, [65, 96])
})

test('una lista sin repetidos sale exactamente igual', () => {
  const entrada = [fila({ id: 'a' }), fila({ id: 'b', bien: 'mat:1111BBB' }), fila({ id: 'c', tipo: 'hogar', bien: 'SEVILLA · CP 41001' })]
  const g = agruparHistoricas(entrada)
  assert.equal(g.length, 3)
  assert.deepEqual(g.map(x => x.poliza.id), ['a', 'b', 'c'])
  assert.ok(g.every(x => x.filas.length === 1))
})

test('lista vacía → sin grupos', () => {
  assert.deepEqual(agruparHistoricas([]), [])
})
