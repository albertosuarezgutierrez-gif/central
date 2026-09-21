import test from 'node:test'
import assert from 'node:assert/strict'
import { consultaSugerida, etiquetarOpciones, filtrarOpciones, normalizar } from './filtrar-opciones.ts'

// Catálogo real (Hyundai Kona), con los tres homónimos que lo motivaron.
const CATALOGO = [
  { id: 'B7-001', nombre: '1.0 TGDI 48V STYLE 4X2' },
  { id: 'B7-002', nombre: '1.0 TGDI 48V TECNO 4X2' },
  { id: 'B7-003', nombre: '1.0 TGDI 48V TECNO 4X2' },
  { id: 'B7-004', nombre: '1.0 TGDI ESSENCE 4X2' },
  { id: 'B7-005', nombre: '1.6 GDI DT TECNO RED 4X2' },
]

test('normalizar quita acentos, mayúsculas y espacios de sobra', () => {
  assert.equal(normalizar('  Versión   ÚNICA '), 'version unica')
})

test('los términos se exigen TODOS y en cualquier orden', () => {
  assert.equal(filtrarOpciones(CATALOGO, 'tecno 48v').length, 2)
  assert.equal(filtrarOpciones(CATALOGO, '48v tecno').length, 2)
  assert.equal(filtrarOpciones(CATALOGO, 'tecno essence').length, 0)
})

test('una consulta vacía devuelve el catálogo entero', () => {
  assert.equal(filtrarOpciones(CATALOGO, '   ').length, CATALOGO.length)
})

test('busca también por el código, que es lo que pide el tarificador', () => {
  assert.deepEqual(
    filtrarOpciones(CATALOGO, 'b7-004').map((o) => o.id),
    ['B7-004'],
  )
})

test('la opción YA ELEGIDA nunca se filtra fuera', () => {
  // Sin este brazo el <select> se quedaría en blanco mientras el formulario
  // sigue llevando ese código: «no has elegido» sobre un dato elegido.
  const r = filtrarOpciones(CATALOGO, 'essence', 'B7-002')
  assert.deepEqual(r.map((o) => o.id).sort(), ['B7-002', 'B7-004'])
})

test('el código solo se añade a los nombres REPETIDOS', () => {
  const e = etiquetarOpciones(CATALOGO)
  assert.equal(e[1].etiqueta, '1.0 TGDI 48V TECNO 4X2 · B7-002')
  assert.equal(e[2].etiqueta, '1.0 TGDI 48V TECNO 4X2 · B7-003')
  assert.equal(e[0].etiqueta, '1.0 TGDI 48V STYLE 4X2')
})

test('la pista de otra póliza se recorta a lo que el catálogo SÍ reconoce', () => {
  // «HEV» no existe en ninguna versión: si la pista entrara entera, el
  // buscador nacería filtrando a cero.
  const q = consultaSugerida(CATALOGO, 'HEV 1.6 GDI DT TECNO RED')
  assert.equal(q, '1.6 gdi dt tecno red')
  assert.deepEqual(
    filtrarOpciones(CATALOGO, q).map((o) => o.id),
    ['B7-005'],
  )
})

test('una pista que no casa con nada deja el buscador vacío, no roto', () => {
  assert.equal(consultaSugerida(CATALOGO, 'FORFOUR PURE 1.1'), '')
})
