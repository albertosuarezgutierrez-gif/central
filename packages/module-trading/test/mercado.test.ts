import { test } from 'node:test'
import assert from 'node:assert/strict'
import { posicionRango52, tendenciaMedias, fuerzaRelativa } from '../src/mercado.ts'

test('posicionRango52 sitúa el precio dentro del rango 52s (0=mínimos, 1=máximos)', () => {
  assert.equal(posicionRango52(50, 0, 100), 0.5)
  assert.equal(posicionRango52(10, 0, 100), 0.1)   // cerca de mínimos = barata
  assert.equal(posicionRango52(90, 0, 100), 0.9)
})

test('posicionRango52 recorta a [0,1] y tolera datos ausentes o rango inválido', () => {
  assert.equal(posicionRango52(120, 0, 100), 1)     // por encima del máximo anual
  assert.equal(posicionRango52(-5, 0, 100), 0)
  assert.equal(posicionRango52(50, undefined, 100), undefined)
  assert.equal(posicionRango52(50, 100, 100), undefined)  // rango degenerado
})

test('fuerzaRelativa positiva si el activo bate al índice en la ventana', () => {
  const idx = Array.from({ length: 64 }, (_, i) => 100 + i * 0.1)      // índice +~6%
  const gana = Array.from({ length: 64 }, (_, i) => 100 + i * 0.5)     // activo +~30%
  const pierde = Array.from({ length: 64 }, (_, i) => 100 - i * 0.2)   // activo cae
  assert.ok(fuerzaRelativa(gana, idx)! > 0)
  assert.ok(fuerzaRelativa(pierde, idx)! < 0)
  assert.equal(fuerzaRelativa([1, 2, 3], idx), undefined)              // ventana insuficiente
})

test('tendenciaMedias clasifica por medias 50/200', () => {
  assert.equal(tendenciaMedias(110, 100, 90), 'alcista')
  assert.equal(tendenciaMedias(80, 100, 110), 'bajista')
  assert.equal(tendenciaMedias(105, 100, 110), 'mixta')
  assert.equal(tendenciaMedias(105, undefined, 110), undefined)
})
