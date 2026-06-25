// Tests de atribución host/guest a partir de lo que NOSOTROS enviamos. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizarTexto, setEnviados, corregirAtribucion, esEcoPropio } from './atribucion.ts'

const H = (id: string, from: 'guest' | 'host', text: string) => ({ id, from, text, ts: '' })

test('reproduce el bug: nuestra respuesta auto-enviada, sin marca de emisor, NO es del huésped', () => {
  // Smoobu devolvió nuestra propia respuesta sin `sent_by_owner` → llegó etiquetada como 'guest',
  // y el agente acabó proponiéndose una respuesta a sí mismo (reserva 142771692, 25/06/2026).
  const historial = [
    H('1', 'guest', 'Hola, ¿el alojamiento dispone de cafetera? ¿Y microondas?'),
    H('2', 'guest', 'Sí, el alojamiento dispone de cafetera y microondas.'), // ← nuestra, mal etiquetada
  ]
  const enviados = setEnviados(['Sí, el alojamiento dispone de cafetera y microondas.'])
  const corregido = corregirAtribucion(historial, enviados)
  assert.equal(corregido.at(-1)!.from, 'host')   // el último mensaje ya NO se toma por del huésped
  assert.equal(corregido[0].from, 'guest')       // la pregunta real sigue siendo del huésped
})

test('esEcoPropio detecta la pregunta del sondeo aunque aún no esté en el historial', () => {
  const enviados = setEnviados(['Sí, el alojamiento dispone de cafetera y microondas.'])
  assert.equal(esEcoPropio('  SÍ, el alojamiento  dispone de cafetera y microondas. ', enviados), true)
  assert.equal(esEcoPropio('¿Qué tipo de cafetera?', enviados), false)
})

test('no marca como propio un texto corto (un huésped podría coincidir por azar)', () => {
  const enviados = setEnviados(['Sí', 'ok', 'gracias'])   // todos por debajo del mínimo → no entran
  assert.equal(enviados.size, 0)
  assert.equal(esEcoPropio('Sí', enviados), false)
})

test('normalizarTexto: minúsculas + espacios colapsados', () => {
  assert.equal(normalizarTexto('  Hola   MUNDO  '), 'hola mundo')
})

test('corregirAtribucion devuelve el mismo historial si no hay envíos (sin trabajo)', () => {
  const historial = [H('1', 'guest', 'hola')]
  assert.equal(corregirAtribucion(historial, new Set()), historial)  // misma referencia (early return)
})
