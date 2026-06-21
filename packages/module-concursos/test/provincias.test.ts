// Tests del mapa PURO provincia↔CCAA. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { COMUNIDADES, provinciasDeComunidad, comunidadDeProvincia } from '../src/provincias.ts'

test('COMUNIDADES: ids únicos y provincias no vacías', () => {
  const ids = COMUNIDADES.map(c => c.id)
  assert.equal(new Set(ids).size, ids.length, 'ids duplicados')
  for (const c of COMUNIDADES) {
    assert.ok(c.nombre.length > 0, `comunidad ${c.id} sin nombre`)
    assert.ok(c.provincias.length > 0, `comunidad ${c.id} sin provincias`)
  }
})

test('provinciasDeComunidad: Andalucía trae sus 8 provincias', () => {
  const p = provinciasDeComunidad('andalucia')
  assert.equal(p.length, 8)
  for (const prov of ['Sevilla', 'Huelva', 'Granada', 'Cádiz', 'Málaga', 'Córdoba', 'Jaén', 'Almería']) {
    assert.ok(p.includes(prov), `falta ${prov}`)
  }
})

test('provinciasDeComunidad: id desconocida → []', () => {
  assert.deepEqual(provinciasDeComunidad('no_existe'), [])
})

test('comunidadDeProvincia: tolera acentos y mayúsculas', () => {
  assert.equal(comunidadDeProvincia('Cádiz'), 'andalucia')
  assert.equal(comunidadDeProvincia('CADIZ'), 'andalucia')
  assert.equal(comunidadDeProvincia('sevilla'), 'andalucia')
  assert.equal(comunidadDeProvincia('Madrid'), 'madrid')
})

test('comunidadDeProvincia: desconocida o vacía → undefined', () => {
  assert.equal(comunidadDeProvincia('Lisboa'), undefined)
  assert.equal(comunidadDeProvincia(''), undefined)
})
