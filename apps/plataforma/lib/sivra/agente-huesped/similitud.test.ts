import { test } from 'node:test'
import assert from 'node:assert'
import {
  mezclarPorRelevancia, palabrasClave, regexClaves,
  UMBRAL_PARECIDO, LONGITUD_MINIMA, MAX_APRENDIZAJES, RESERVA_RECIENTES,
} from './similitud-reglas.ts'

const id = (x: string) => x

// ---- mezcla parecido + reciente -------------------------------------------------------------
test('lo parecido va PRIMERO y lo reciente detrás', () => {
  assert.deepEqual(mezclarPorRelevancia(['p1', 'p2'], ['r1', 'r2'], id, 8, 3), ['p1', 'p2', 'r1', 'r2'])
})

test('no duplica lo que aparece en las dos listas', () => {
  assert.deepEqual(mezclarPorRelevancia(['a', 'b'], ['b', 'c'], id, 8, 3), ['a', 'b', 'c'])
})

// El fallo simétrico del solo-parecido: lo último que enseñó Alberto no puede desaparecer del
// prompt por no venir a cuento hoy. Por eso hay cuota reservada.
test('reserva hueco a lo reciente aunque sobren parecidas', () => {
  const out = mezclarPorRelevancia(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'], ['r1', 'r2', 'r3'], id, 8, 3)
  assert.equal(out.length, 8)
  assert.deepEqual(out.slice(0, 5), ['p1', 'p2', 'p3', 'p4', 'p5'])
  assert.deepEqual(out.slice(5), ['r1', 'r2', 'r3'])
})

test('si no hay recientes suficientes, el cupo lo completan las parecidas', () => {
  const out = mezclarPorRelevancia(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], ['r1'], id, 8, 3)
  assert.equal(out.length, 8)
  assert.ok(out.includes('r1') && out.includes('p6') && out.includes('p7'))
})

test('sin parecidas se comporta como antes (solo recencia)', () => {
  assert.deepEqual(mezclarPorRelevancia([], ['r1', 'r2', 'r3'], id, 8, 3), ['r1', 'r2', 'r3'])
})

test('nunca devuelve más del tope', () => {
  const muchas = Array.from({ length: 30 }, (_, i) => `p${i}`)
  assert.equal(mezclarPorRelevancia(muchas, muchas, id, 8, 3).length, 8)
})

test('no se agranda el prompt: el tope sigue siendo 8, con 3 reservadas', () => {
  assert.equal(MAX_APRENDIZAJES, 8)
  assert.equal(RESERVA_RECIENTES, 3)
})

// ---- palabras de contenido (la señal que caza la paráfrasis) --------------------------------
// Caso fundacional: los cuatro avisos de phishing de finales de agosto están escritos de formas
// distintas y solo comparten «whatsapp». Con el trigrama a secas puntuaban 0,20 — por debajo del
// ruido de un par NO relacionado (0,19). Medido contra mensajes_guia_gaps el 04/09/2026.
test('palabrasClave saca el término que de verdad identifica el tema', () => {
  const c = palabrasClave('No sé si han sido ustedes o si es un fraude, me han escrito por WhatsApp')
  assert.ok(c.includes('whatsapp'), `esperaba whatsapp en ${JSON.stringify(c)}`)
  assert.ok(c.includes('fraude'))
})

test('palabrasClave descarta el relleno de cortesía', () => {
  assert.deepEqual(palabrasClave('Hola, buenas noches, muchas gracias'), [])
  assert.deepEqual(palabrasClave('Hello, good morning, thanks'), [])
})

test('palabrasClave no repite ni se pasa del tope', () => {
  const c = palabrasClave('parking parking parking aparcamiento coche llaves maletas basura ventanas')
  assert.equal(new Set(c).size, c.length)
  assert.ok(c.length <= 6)
})

test('regexClaves casa palabra entera y no un trozo', () => {
  const re = new RegExp(regexClaves(['whatsapp'])!.replace(/\[:alnum:\]/g, 'a-zA-Z0-9'), 'i')
  assert.ok(re.test('recibido un mensaje por whatsapp desde eeuu'))
  assert.ok(!re.test('whatsappeando'))
})

test('regexClaves sin claves devuelve null (no casa con todo)', () => {
  assert.equal(regexClaves([]), null)
  assert.equal(regexClaves(['hola;drop']), null)
})

// ---- guardas ---------------------------------------------------------------------------------
// word_similarity('hola', <cualquier texto con «hola»>) = 1,00. Medido en la BD real: sin esta
// guarda, un «hola» se fusionaría con cualquier hueco largo del piso.
test('la longitud mínima existe porque una pregunta corta satura el trigrama', () => {
  assert.ok(LONGITUD_MINIMA >= 15)
  assert.ok('hola'.length < LONGITUD_MINIMA)
  assert.ok('no sé si han sido ustedes o si es un fraude'.length >= LONGITUD_MINIMA)
})

test('el umbral deja fuera el ruido de trigramas pero no es prohibitivo', () => {
  assert.ok(UMBRAL_PARECIDO > 0.15 && UMBRAL_PARECIDO < 0.6)
})
