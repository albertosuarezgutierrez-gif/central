import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paramsDnploc, elegirViaConTipo, elegirVia } from './parser.ts'

// La dirección tal y como la dice un cliente de hogar (caso real, 02/09/2026).
test('«Calle San Vicente 40, 2º 14» → planta 2 y puerta 14', () => {
  const p = paramsDnploc('Calle San Vicente 40, 2º 14')
  assert.equal(p?.sigla, 'CL')
  assert.equal(p?.calle, 'SAN VICENTE')
  assert.equal(p?.numero, '40')
  assert.equal(p?.planta, '2')
  assert.equal(p?.puerta, '14')
})

test('«3º B» y «1º izquierda» siguen funcionando', () => {
  assert.equal(paramsDnploc('Avenida de Madrid 78, 3º B')?.puerta, 'B')
  assert.equal(paramsDnploc('C/ Sierpes 12, 1º izquierda')?.puerta, 'IZ')
})

test('sin ordinal no se confunde el portal con la puerta', () => {
  const p = paramsDnploc('Calle San Vicente 40')
  assert.equal(p?.puerta, null)
  assert.equal(p?.planta, null)
})

// ─── elegirViaConTipo() / elegirVia() ────────────────────────────────────────
// El callejero busca por SUBCADENA: «GANDIA» puede devolver varias calles.
// `elegirViaConTipo` desempata por tokens y, a diferencia de `elegirVia`,
// conserva el `tipo` (tv) de la ganadora — es lo que usa
// `resolverTipoViaPorNombre()` para averiguar el tipo de vía cuando la ficha
// no trae uno reconocible.

test('elegirViaConTipo: una única candidata gana y conserva su tipo', () => {
  const vias = [{ tipo: 'CL', nombre: 'PACO GANDIA' }]
  assert.deepEqual(elegirViaConTipo(vias, 'Paco Gandía'), { tipo: 'CL', nombre: 'PACO GANDIA' })
  assert.equal(elegirVia(vias, 'Paco Gandía'), 'PACO GANDIA')
})

test('elegirViaConTipo: entre varias, gana la que menos palabras sobrantes tiene', () => {
  const vias = [
    { tipo: 'AV', nombre: 'PACO GANDIA MOLINA' },
    { tipo: 'CL', nombre: 'PACO GANDIA' },
  ]
  // Las dos contienen los dos tokens buscados, pero la segunda no trae ninguno
  // de sobra: gana ella, no la más larga.
  assert.deepEqual(elegirViaConTipo(vias, 'Paco Gandia'), { tipo: 'CL', nombre: 'PACO GANDIA' })
})

test('elegirViaConTipo: mismo número de tokens sobrantes en candidatas distintas es ambigüedad', () => {
  // Ejemplo real del callejero: «GANDIA» encuentra «CIUDAD DE GANDIA» (2 tokens
  // tras quitar el artículo) y «PACO GANDIA» (2 tokens) — empatan, y `elegirVia`
  // no decide a dedo entre dos calles de la misma longitud.
  const vias = [
    { tipo: 'AV', nombre: 'CIUDAD DE GANDIA' },
    { tipo: 'CL', nombre: 'PACO GANDIA' },
  ]
  assert.equal(elegirViaConTipo(vias, 'Gandia'), null)
})

test('elegirViaConTipo: dos candidatas igual de ajustadas son ambigüedad real, no se elige a dedo', () => {
  const vias = [
    { tipo: 'CL', nombre: 'SAN VICENTE' },
    { tipo: 'AV', nombre: 'SAN VICENTE' },
  ]
  assert.equal(elegirViaConTipo(vias, 'San Vicente'), null)
  assert.equal(elegirVia(vias, 'San Vicente'), null)
})

test('elegirViaConTipo: sin candidatas, null', () => {
  assert.equal(elegirViaConTipo([], 'Severo Ochoa'), null)
  assert.equal(elegirViaConTipo([{ tipo: 'CL', nombre: 'SIERPES' }], 'Severo Ochoa'), null)
})
