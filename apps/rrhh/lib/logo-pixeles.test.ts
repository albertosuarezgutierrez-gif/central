import { describe, it, expect } from 'vitest'
import { bboxContenido, colorDominante } from './logo-pixeles'

function img(w: number, h: number, fill: [number, number, number, number]) {
  const d = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) d.set(fill, i * 4)
  return d
}
function rect(d: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number, c: [number, number, number, number]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d.set(c, (y * w + x) * 4)
}

describe('bboxContenido', () => {
  it('recorta márgenes blancos uniformes', () => {
    const d = img(100, 50, [255, 255, 255, 255]); rect(d, 100, 20, 10, 60, 30, [0, 0, 200, 255])
    expect(bboxContenido(d, 100, 50)).toEqual({ left: 20, top: 10, width: 40, height: 20 })
  })
  it('recorta márgenes transparentes y respeta el respiro sin salirse', () => {
    const d = img(100, 50, [0, 0, 0, 0]); rect(d, 100, 1, 1, 10, 10, [200, 0, 0, 255])
    expect(bboxContenido(d, 100, 50, 5)).toEqual({ left: 0, top: 0, width: 15, height: 15 })
  })
  it('todo blanco o todo transparente → null', () => {
    expect(bboxContenido(img(10, 10, [255, 255, 255, 255]), 10, 10)).toBeNull()
    expect(bboxContenido(img(10, 10, [0, 0, 0, 0]), 10, 10)).toBeNull()
  })
  it('sin margen devuelve la imagen entera', () => {
    expect(bboxContenido(img(8, 4, [10, 10, 10, 255]), 8, 4)).toEqual({ left: 0, top: 0, width: 8, height: 4 })
  })
})

describe('colorDominante', () => {
  it('elige el color saturado más poblado e ignora blanco', () => {
    const d = img(100, 100, [255, 255, 255, 255])
    rect(d, 100, 0, 0, 50, 50, [27, 52, 97, 255]); rect(d, 100, 60, 60, 70, 70, [200, 30, 30, 255])
    expect(colorDominante(d, 100, 100)).toBe('#1b3461')
  })
  it('PNG transparente con trazo de color', () => {
    const d = img(40, 40, [0, 0, 0, 0]); rect(d, 40, 5, 5, 20, 20, [180, 107, 39, 255])
    expect(colorDominante(d, 40, 40)).toBe('#b46b27')
  })
  it('logo blanco o vacío → null', () => {
    expect(colorDominante(img(10, 10, [255, 255, 255, 255]), 10, 10)).toBeNull()
    expect(colorDominante(img(10, 10, [0, 0, 0, 0]), 10, 10)).toBeNull()
  })
  it('escala de grises y negro → null (look ASegura)', () => {
    const d = img(20, 20, [255, 255, 255, 255]); rect(d, 20, 0, 0, 10, 10, [0, 0, 0, 255]); rect(d, 20, 10, 10, 20, 20, [128, 128, 128, 255])
    expect(colorDominante(d, 20, 20)).toBeNull()
  })
  it('un color casi invisible (< 1 %) no cuenta', () => {
    const d = img(100, 100, [0, 0, 0, 255]); rect(d, 100, 0, 0, 5, 5, [200, 0, 0, 255])
    expect(colorDominante(d, 100, 100)).toBeNull()
  })
})
