import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ipDe, dejaPasar, crearCacheAcotada, componerDireccion, direccionValida } from './direccion-cp.ts'

test('ipDe: primera IP o «desconocida»', () => {
  assert.equal(ipDe('1.2.3.4, 5.6.7.8'), '1.2.3.4')
  assert.equal(ipDe(null), 'desconocida')
  assert.equal(ipDe('  '), 'desconocida')
})

test('dejaPasar: corta al superar el máximo y reabre al acabar la ventana', () => {
  const m = new Map<string, { n: number; hasta: number }>()
  assert.equal(dejaPasar(m, 'a', 0, 2, 1000), true)
  assert.equal(dejaPasar(m, 'a', 1, 2, 1000), true)
  assert.equal(dejaPasar(m, 'a', 2, 2, 1000), false)
  assert.equal(dejaPasar(m, 'b', 2, 2, 1000), true)
  assert.equal(dejaPasar(m, 'a', 1001, 2, 1000), true)
})

test('dejaPasar: el mapa no crece sin límite', () => {
  const m = new Map<string, { n: number; hasta: number }>()
  for (let i = 0; i < 50; i++) dejaPasar(m, `ip${i}`, 0, 1, 1000, 10)
  assert.ok(m.size <= 10)
})

test('caché acotada: TTL y tamaño', () => {
  const c = crearCacheAcotada<number>(2, 100)
  c.set('a', 1, 0); c.set('b', 2, 0); c.set('c', 3, 0)
  assert.equal(c.size, 2)
  assert.equal(c.get('a', 1), undefined)
  assert.equal(c.get('c', 1), 3)
  assert.equal(c.get('c', 101), undefined)
})

test('componerDireccion: calle + CP + municipio, sin inventar', () => {
  assert.equal(componerDireccion({ calle: ' Calle  Mayor 1 ', cp: '41003', municipio: 'Sevilla' }), 'Calle Mayor 1, 41003 Sevilla')
  assert.equal(componerDireccion({ calle: 'Calle Mayor 1', cp: '', municipio: '' }), 'Calle Mayor 1')
  assert.equal(componerDireccion({ calle: 'Calle Mayor 1', cp: '41', municipio: 'Sevilla' }), 'Calle Mayor 1, Sevilla')
  assert.equal(componerDireccion({ calle: '', cp: '41003', municipio: 'Sevilla' }), '')
})

test('direccionValida: obligatoria exige CP + municipio + calle; opcional admite vacía pero no a medias', () => {
  const ok = { calle: 'Calle Mayor 1', cp: '41003', municipio: 'Sevilla' }
  assert.equal(direccionValida(ok, true), true)
  assert.equal(direccionValida({ ...ok, municipio: '' }, true), false)
  assert.equal(direccionValida({ ...ok, cp: '4100' }, false), false)
  assert.equal(direccionValida({ calle: '', cp: '', municipio: '' }, false), true)
  assert.equal(direccionValida({ calle: '', cp: '', municipio: '' }, true), false)
})

import { direccionOkParaPedido } from './direccion-cp.ts'
test('direccionOkParaPedido: solo exige dirección en delivery', () => {
  const vacia = { calle: '', cp: '', municipio: '' }
  const ok = { calle: 'Calle Mayor 1', cp: '41003', municipio: 'Sevilla' }
  assert.equal(direccionOkParaPedido('delivery', vacia), false)
  assert.equal(direccionOkParaPedido('delivery', { ...ok, municipio: '' }), false)
  assert.equal(direccionOkParaPedido('delivery', ok), true)
  assert.equal(direccionOkParaPedido('recogida', vacia), true)
  assert.equal(direccionOkParaPedido('sala', vacia), true)
})

import { componerDireccionExtranjera, direccionConCiudad, provinciasParaCatastro } from './direccion-cp.ts'
test('extranjera: calle libre + país', () => {
  assert.equal(componerDireccionExtranjera('Rua Augusta 10, 1100 Lisboa', 'Portugal'), 'Rua Augusta 10, 1100 Lisboa, Portugal')
  assert.equal(componerDireccionExtranjera('Rua Augusta 10', ''), '')
})
test('direccionConCiudad no duplica la ciudad', () => {
  assert.equal(direccionConCiudad('Calle Mayor 1, 41003 Sevilla', 'Sevilla'), 'Calle Mayor 1, 41003 Sevilla')
  assert.equal(direccionConCiudad('Calle Mayor 1', 'Sevilla'), 'Calle Mayor 1, Sevilla')
  assert.equal(direccionConCiudad('', 'Sevilla'), 'Sevilla')
})
test('provinciasParaCatastro', () => {
  const alt = (p: string) => (p === 'Bizkaia' ? 'Vizcaya' : null)
  assert.deepEqual(provinciasParaCatastro('Bizkaia', alt), ['Bizkaia', 'Vizcaya'])
  assert.deepEqual(provinciasParaCatastro('Sevilla', alt), ['Sevilla'])
})
