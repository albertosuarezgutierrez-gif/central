import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planBackfillDni, type FichaDni } from './backfill-dni.ts'

// Hash de juguete: determinístico y legible en los asserts.
const h = (dni: string) => `H(${dni.toUpperCase().replace(/[^A-Z0-9]/g, '')})`
const ficha = (x: Partial<FichaDni> & { id: string }): FichaDni => ({
  esCliente: true,
  dni: null,
  hashActual: null,
  ...x,
})

test('una ficha con DNI y sin hash es rellenable', () => {
  const p = planBackfillDni([ficha({ id: 'a', dni: '12345678Z' })], h)
  assert.equal(p.filas[0].destino, 'rellenable')
  assert.equal(p.filas[0].hash, 'H(12345678Z)')
  assert.deepEqual(p.choques, [])
})

test('dos fichas cliente con el mismo DNI NO son rellenables: son un choque', () => {
  // Es el caso que revienta `uq_clientes_dni_lookup_hash`, y el hallazgo que se busca.
  const p = planBackfillDni(
    [ficha({ id: 'a', dni: '12345678Z' }), ficha({ id: 'b', dni: '12.345.678-z' })],
    h,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['choca', 'choca'])
  assert.equal(p.choques.length, 1)
  assert.deepEqual(p.choques[0].fichas, ['a', 'b'])
  assert.equal(p.resumen.rellenables, 0)
})

test('el choque contra una ficha que YA tenía el hash pone a esa primera', () => {
  // La preexistente es la que sobrevive por defecto en la fusión.
  const p = planBackfillDni(
    [ficha({ id: 'nueva', dni: '12345678Z' }), ficha({ id: 'vieja', hashActual: 'H(12345678Z)' })],
    h,
  )
  assert.equal(p.choques.length, 1)
  assert.deepEqual(p.choques[0].fichas, ['vieja', 'nueva'])
  assert.equal(p.choques[0].hayPreexistente, true)
})

test('un lead con el mismo DNI que un cliente no choca: el índice único es parcial', () => {
  const p = planBackfillDni(
    [ficha({ id: 'cli', dni: '12345678Z' }), ficha({ id: 'lead', dni: '12345678Z', esCliente: false })],
    h,
  )
  assert.deepEqual(p.choques, [])
  assert.deepEqual(p.filas.map((f) => f.destino), ['rellenable', 'rellenable'])
})

test('el DNI que no descifra es ILEGIBLE, nunca «sin DNI»', () => {
  const p = planBackfillDni([ficha({ id: 'a', dni: null, descifradoFallido: true })], h)
  assert.equal(p.filas[0].destino, 'ilegible')
  assert.equal(p.filas[0].motivo, 'no_descifra')
  assert.equal(p.resumen.sinDni, 0)
})

test('sin clave de hashing la ficha cae en ilegible, no en rellenable', () => {
  // `computeDniLookupHash` devuelve null si falta PII_LOOKUP_KEY. Tratar eso
  // como «nada que hacer» dejaría el backfill en silencio diciendo que ya está.
  const p = planBackfillDni([ficha({ id: 'a', dni: '12345678Z' })], () => null)
  assert.equal(p.filas[0].destino, 'ilegible')
  assert.equal(p.resumen.rellenables, 0)
})

test('si el hashing lanza, la ficha cae en ilegible en vez de tumbar el plan', () => {
  const p = planBackfillDni([ficha({ id: 'a', dni: '12345678Z' })], () => {
    throw new Error('PII_LOOKUP_KEY malformed')
  })
  assert.equal(p.filas[0].destino, 'ilegible')
})

test('un valor de cajón no genera hash: no puede fundir a dos personas', () => {
  // «PENDIENTE» en dos fichas distintas las fundiría en una si se hashease.
  const pareceDoc = (d: string) => /^\d{8}[A-Z]$/.test(d.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  const p = planBackfillDni(
    [ficha({ id: 'a', dni: 'PENDIENTE' }), ficha({ id: 'b', dni: 'PENDIENTE' })],
    h,
    pareceDoc,
  )
  assert.deepEqual(p.filas.map((f) => f.destino), ['ilegible', 'ilegible'])
  assert.deepEqual(p.choques, [])
  assert.equal(p.filas[0].motivo, 'no_parece_documento')
})

test('la ficha sin DNI se cuenta aparte de la ilegible', () => {
  const p = planBackfillDni(
    [ficha({ id: 'a' }), ficha({ id: 'b', dni: '   ' }), ficha({ id: 'c', dni: null, descifradoFallido: true })],
    h,
  )
  assert.equal(p.resumen.sinDni, 2)
  assert.equal(p.resumen.ilegibles, 1)
})

test('el resumen cuadra con las filas', () => {
  const p = planBackfillDni(
    [
      ficha({ id: 'a', dni: '12345678Z' }),
      ficha({ id: 'b', dni: '12345678Z' }),
      ficha({ id: 'c', dni: '87654321X' }),
      ficha({ id: 'd', hashActual: 'H(11111111H)' }),
      ficha({ id: 'e' }),
    ],
    h,
  )
  const { total, sinDni, yaTiene, ilegibles, rellenables, enChoque } = p.resumen
  assert.equal(total, 5)
  assert.equal(sinDni + yaTiene + ilegibles + rellenables + enChoque, total)
  assert.equal(enChoque, 2)
  assert.equal(rellenables, 1)
})

test('tres fichas con el mismo DNI salen en un solo grupo', () => {
  const p = planBackfillDni(
    ['a', 'b', 'c'].map((id) => ficha({ id, dni: '12345678Z' })),
    h,
  )
  assert.equal(p.choques.length, 1)
  assert.equal(p.choques[0].fichas.length, 3)
})
