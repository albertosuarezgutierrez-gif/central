// Tests de atribución host/guest a partir de lo que NOSOTROS enviamos. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizarTexto, setEnviados, corregirAtribucion, esEcoPropio, atribuirEmisor } from './atribucion.ts'

const H = (id: string, from: 'guest' | 'host', text: string) => ({ id, from, text, ts: '' })

test('atribuirEmisor: type===1 es del huésped; cualquier otro type es del host', () => {
  assert.equal(atribuirEmisor({ type: 1 }), 'guest')
  assert.equal(atribuirEmisor({ type: '1' }), 'guest')  // Smoobu a veces lo manda como string
  assert.equal(atribuirEmisor({ type: 2 }), 'host')
  assert.equal(atribuirEmisor({ type: 3 }), 'host')
})

test('atribuirEmisor: sent_by_owner manda aunque no venga type', () => {
  assert.equal(atribuirEmisor({ sent_by_owner: true }), 'host')
  assert.equal(atribuirEmisor({ sent_by_owner: false }), 'guest')
})

test('atribuirEmisor: sin señal fiable cae a huésped (= comportamiento previo, sin regresión)', () => {
  assert.equal(atribuirEmisor({}), 'guest')
  assert.equal(atribuirEmisor({ type: '' }), 'guest')
  assert.equal(atribuirEmisor({ type: null }), 'guest')
  assert.equal(atribuirEmisor(null), 'guest')
  assert.equal(atribuirEmisor(undefined), 'guest')
})

test('reproduce el bug: mensaje propio enviado A MANO (sin sent_by_owner pero type host) → host', () => {
  // Reserva 131511815 (House Sevillana): Alberto mandó desde Smoobu "Importante recordar el ruido en
  // las horas de descanso". Vino SIN `sent_by_owner` (lo etiquetaba 'guest') y NO está en mensajes_log
  // (no salió por el agente), así que `corregirAtribucion` tampoco lo veía → el agente le redactaba
  // una respuesta. Con `type` host (≠1) ahora se atribuye al host y el guard "último=host" lo descarta.
  const m = { type: 2, sent_by_owner: '', message: 'Importante recordar el ruido en las horas de descanso. Gracias' }
  assert.equal(atribuirEmisor(m), 'host')
})

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
