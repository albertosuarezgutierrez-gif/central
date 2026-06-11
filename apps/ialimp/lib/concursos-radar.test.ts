// Tests del parser PURO de ATOM PLACSP. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parsearAtomPlacsp, dedupeKey } from './concursos-radar.ts'
import { matchesDeAtom } from './concursos-radar.ts'

const here = dirname(fileURLToPath(import.meta.url))
const xml = readFileSync(join(here, '__fixtures__', 'placsp-sample.atom.xml'), 'utf8')

test('parsearAtomPlacsp: extrae los anuncios con sus campos', () => {
  const anuncios = parsearAtomPlacsp(xml)
  assert.equal(anuncios.length, 2)

  const limpieza = anuncios[0]
  assert.match(limpieza.titulo, /limpieza de colegios/i)
  assert.deepEqual(limpieza.cpv, ['90910000'])
  assert.equal(limpieza.presupuesto, 120000)
  assert.match(limpieza.organo ?? '', /Avilés/)
  assert.match(limpieza.url ?? '', /idEvl=AAA111/)
  assert.equal(limpieza.expediente, '11111/2026')

  const obra = anuncios[1]
  assert.equal(obra.presupuesto, undefined) // sin BudgetAmount
  assert.deepEqual(obra.cpv, ['45233140'])
})

test('dedupeKey: estable y determinista para el mismo anuncio', () => {
  const [a] = parsearAtomPlacsp(xml)
  const k1 = dedupeKey(a)
  const k2 = dedupeKey({ ...a })
  assert.equal(k1, k2)
  assert.ok(k1.length > 0)
})

test('parsearAtomPlacsp: XML vacío o sin entradas devuelve []', () => {
  assert.deepEqual(parsearAtomPlacsp('<feed></feed>'), [])
  assert.deepEqual(parsearAtomPlacsp(''), [])
})

test('matchesDeAtom: filtra por criterios y trae puntuación + dedupe_key', () => {
  const m = matchesDeAtom(xml, { cpv: ['9091'], palabras_clave: ['limpieza'] })
  assert.equal(m.length, 1)                 // solo la de limpieza
  assert.equal(m[0].dedupe_key, '11111/2026')
  assert.ok(m[0].puntuacion > 0)
  assert.ok(m[0].motivos.length > 0)
})
