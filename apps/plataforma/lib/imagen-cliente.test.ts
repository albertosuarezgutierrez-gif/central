// apps/plataforma/lib/imagen-cliente.test.ts
// Cepos de la parte PURA de `imagen-cliente.ts`. El encogido de verdad usa canvas y solo se puede
// medir en un navegador: eso se probó con Chromium (Playwright) y la salida está en el PR — aquí
// queda lo que sí puede vigilar el CI, empezando por el número que causó el fallo del 07/09/2026.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { medidas, esImagen, pesoLegible, TOPE_BASE64 } from './imagen-cliente.ts'

// 🚨 EL CEPO QUE IMPORTA. Una Serverless Function de Vercel corta el CUERPO de la petición muy por
// debajo de los 11 MB que el código daba por buenos, y lo corta en la PLATAFORMA: sin invocar la
// función, sin log y sin JSON. Un tope por encima de ese corte no es un tope, es una franja en la
// que el usuario recibe «se me ha cortado la conexión» y aquí no consta ni el intento.
const LIMITE_CUERPO_VERCEL = 4_500_000

test('el tope de subida cabe en el cuerpo que acepta la plataforma, con holgura para el resto del JSON', () => {
  assert.ok(TOPE_BASE64 < LIMITE_CUERPO_VERCEL, `TOPE_BASE64=${TOPE_BASE64} no cabe en ${LIMITE_CUERPO_VERCEL}`)
  assert.ok(LIMITE_CUERPO_VERCEL - TOPE_BASE64 >= 500_000, 'deja menos de 500 KB de holgura para el resto del JSON')
})

test('el tope del servidor tampoco puede estar por encima del corte de la plataforma', () => {
  // Lee el FUENTE del route: el valor vive en una constante que ni tsc ni el build contrastan con nada.
  const src = readFileSync(new URL('../app/api/contable/chat/route.ts', import.meta.url), 'utf8')
  const m = /const MAX_BASE64 = ([\d_]+)/.exec(src)
  assert.ok(m, 'no encuentro MAX_BASE64 en el route del chat contable')
  const max = Number(m![1].replace(/_/g, ''))
  assert.ok(max <= LIMITE_CUERPO_VERCEL, `MAX_BASE64=${max} está por encima del corte real (${LIMITE_CUERPO_VERCEL}): inalcanzable, engaña`)
})

test('el cliente NO puede permitirse enviar más de lo que acepta el servidor', () => {
  const src = readFileSync(new URL('../app/api/contable/chat/route.ts', import.meta.url), 'utf8')
  const max = Number(/const MAX_BASE64 = ([\d_]+)/.exec(src)![1].replace(/_/g, ''))
  assert.ok(TOPE_BASE64 <= max, 'el cliente enviaría cuerpos que el servidor rechaza con un mensaje distinto')
})

// ── Escalado ────────────────────────────────────────────────────────────────────────────────────
test('una foto de móvil se escala al lado máximo conservando la proporción', () => {
  assert.deepEqual(medidas(4032, 3024), { w: 2200, h: 1650 })
  assert.deepEqual(medidas(3024, 4032), { w: 1650, h: 2200 })   // vertical
})

test('una imagen pequeña NO se agranda (agrandar no añade nada legible y pesa más)', () => {
  assert.deepEqual(medidas(800, 600), { w: 800, h: 600 })
  assert.deepEqual(medidas(2200, 1000), { w: 2200, h: 1000 })   // justo en el límite: intacta
})

// ── Qué se toca y qué no ────────────────────────────────────────────────────────────────────────
test('un PDF no es imagen: no se rasteriza (perdería su capa de texto, que es lo que se lee bien)', () => {
  assert.equal(esImagen('application/pdf', 'factura.pdf'), false)
  assert.equal(esImagen('', 'factura.pdf'), false)
})

test('la foto del móvil se reconoce por tipo o por extensión (algunos navegadores no mandan el tipo)', () => {
  assert.equal(esImagen('image/jpeg', '20260907_093156.jpg'), true)
  assert.equal(esImagen('', '20260907_093156.jpg'), true)
  assert.equal(esImagen('', 'foto.HEIC'), true)
})

// ── Cuánto pesaba / cuánto se envió ─────────────────────────────────────────────────────────────
test('el peso se dice en español y con la unidad que se entiende', () => {
  assert.equal(pesoLegible(3_500_000), '3,3 MB')
  assert.equal(pesoLegible(812_000), '793 KB')
  assert.equal(pesoLegible(10), '1 KB')     // nunca «0 KB»: el fichero existe
})
