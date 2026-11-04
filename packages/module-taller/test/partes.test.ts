import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abrirParte, cerrarParte, minutosParte, horasPorMecanicoYCoche, minutosRealesOt, margenHoras, type ParteHoras } from '../src/index.ts'
import { hoy } from './_util.ts'

const MIN = 60_000
const base = hoy()
const en = (min: number) => new Date(base.getTime() + min * MIN)

test('abrir otro coche cierra el parte abierto del mismo mecánico', () => {
  const partes: ParteHoras[] = [{ id: 'p1', otId: 'ot1', mecanicoId: 'm1', inicio: en(0), fin: null }]
  const r = abrirParte(partes, 'm1', 'ot2', en(50))
  assert.equal(r.cerrar.length, 1)
  assert.equal(r.cerrar[0].fin?.getTime(), en(50).getTime())
  assert.deepEqual(r.abrir, { otId: 'ot2', mecanicoId: 'm1', inicio: en(50) })
})

test('abrir el mismo coche no duplica; otro mecánico no se toca', () => {
  const partes: ParteHoras[] = [
    { id: 'p1', otId: 'ot1', mecanicoId: 'm1', inicio: en(0), fin: null },
    { id: 'p2', otId: 'ot1', mecanicoId: 'm2', inicio: en(0), fin: null },
  ]
  const r = abrirParte(partes, 'm1', 'ot1', en(10))
  assert.equal(r.abrir, null)
  assert.equal(r.cerrar.length, 0)
  assert.deepEqual(cerrarParte(partes, 'm2', en(5)).map((p) => p.id), ['p2'])
})

test('no se cierra con un instante anterior al inicio', () => {
  const partes: ParteHoras[] = [{ id: 'p1', otId: 'ot1', mecanicoId: 'm1', inicio: en(10), fin: null }]
  assert.throws(() => abrirParte(partes, 'm1', 'ot2', en(0)))
})

test('minutos: abierto = null (no 0); cerrado redondeado al minuto', () => {
  assert.equal(minutosParte({ id: 'a', otId: 'o', mecanicoId: 'm', inicio: en(0), fin: null }), null)
  const p = { id: 'a', otId: 'o', mecanicoId: 'm', inicio: en(0), fin: new Date(en(90).getTime() + 31_000) }
  assert.equal(minutosParte(p), 91) // mismo redondeo que la columna generada del SQL
})

test('agregado por mecánico y coche; total de OT null si queda un parte abierto', () => {
  const partes: ParteHoras[] = [
    { id: '1', otId: 'ot1', mecanicoId: 'm1', inicio: en(0), fin: en(30) },
    { id: '2', otId: 'ot1', mecanicoId: 'm1', inicio: en(60), fin: en(75) },
    { id: '3', otId: 'ot1', mecanicoId: 'm2', inicio: en(0), fin: null },
  ]
  const agg = horasPorMecanicoYCoche(partes)
  assert.deepEqual(agg.find((a) => a.mecanicoId === 'm1'), { mecanicoId: 'm1', otId: 'ot1', minutosCerrados: 45, partesAbiertos: 0 })
  assert.deepEqual(agg.find((a) => a.mecanicoId === 'm2'), { mecanicoId: 'm2', otId: 'ot1', minutosCerrados: 0, partesAbiertos: 1 })
  assert.equal(minutosRealesOt(partes, 'ot1'), null)
  assert.equal(minutosRealesOt(partes.slice(0, 2), 'ot1'), 45)
})

test('margen baremo − real × precio hora; falta uno → null', () => {
  assert.deepEqual(margenHoras(60, 45, 4800), { baremoMinutos: 60, realesMinutos: 45, diferenciaMinutos: 15, margenCent: 1200 })
  assert.equal(margenHoras(30, 45, 4800).margenCent, -1200) // se tardó más que el baremo
  assert.equal(margenHoras(null, 45, 4800).margenCent, null)
  assert.equal(margenHoras(60, null, 4800).diferenciaMinutos, null)
  assert.equal(margenHoras(60, 0, 4800).margenCent, 4800) // 0 medido ≠ no medido
})
