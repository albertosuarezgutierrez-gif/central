import { test } from 'node:test'
import assert from 'node:assert/strict'
import { perfilDesdeFila } from './perfil-criterios.ts'

test('fila sin las columnas nuevas (migración sin aplicar) = no filtra', () => {
  const p = perfilDesdeFila({ cuenta_id: 'x', activo: true, provincias: ['Sevilla'] })
  assert.deepEqual(p.municipios, [])
  assert.equal(p.soloUnifamiliar, false)
  assert.equal(p.requierePiscina, false)
  assert.equal(p.dormitoriosMin, undefined)
  assert.equal(p.banosMin, undefined)
  assert.equal(p.superficieParcelaMin, undefined)
  assert.deepEqual(perfilDesdeFila(null).municipios, [])
})

test('fila con las columnas nuevas se mapea (numeric llega como string)', () => {
  const p = perfilDesdeFila({
    municipios: ['Camas', 'Gelves'], solo_unifamiliar: true, dormitorios_min: 4, banos_min: '2',
    superficie_parcela_min: '800', requiere_piscina: true,
  })
  assert.deepEqual(p.municipios, ['Camas', 'Gelves'])
  assert.equal(p.soloUnifamiliar, true)
  assert.equal(p.dormitoriosMin, 4)
  assert.equal(p.banosMin, 2)
  assert.equal(p.superficieParcelaMin, 800)
  assert.equal(p.requierePiscina, true)
})

test('columnas presentes pero NULL = no filtra', () => {
  const p = perfilDesdeFila({ dormitorios_min: null, superficie_parcela_min: null })
  assert.equal(p.dormitoriosMin, undefined)
  assert.equal(p.superficieParcelaMin, undefined)
})
