import { test } from 'node:test'
import assert from 'node:assert'
import { pareceEspanol, necesitaTraduccionPregunta, traduccionUtil, lineaTraduccion } from './reglas.ts'

const esc = (s: string) => s // en los tests no hace falta escapar HTML de verdad

test('un mensaje español con señal propia no pide traducción («Gracias» de Armelle)', () => {
  assert.equal(pareceEspanol('Gracias'), true)
  assert.equal(necesitaTraduccionPregunta('Gracias', 'es'), false)
  assert.equal(necesitaTraduccionPregunta('Hola! Gracias seremos 10 al finales', 'es'), false)
})

test('idioma de respuesta ≠ es → siempre se traduce, diga lo que diga el texto', () => {
  assert.equal(necesitaTraduccionPregunta('Hello thank you', 'en'), true)
  assert.equal(necesitaTraduccionPregunta('Nous pouvons venir maintenant ?', 'fr'), true)
})

test('texto sin señal de idioma con lang=es (heredado de la reserva) TAMBIÉN se traduce', () => {
  // detectLang no puntúa nada aquí y caería al idioma de la reserva; el texto no es español.
  assert.equal(pareceEspanol('Très bien 👍'), false)
  assert.equal(necesitaTraduccionPregunta('Très bien 👍', 'es'), true)
})

test('pregunta vacía no dispara traducción', () => {
  assert.equal(necesitaTraduccionPregunta('', 'fr'), false)
  assert.equal(necesitaTraduccionPregunta('   ', 'en'), false)
})

test('la «traducción» que vuelve igual que el original no genera línea', () => {
  assert.equal(traduccionUtil('Gracias', 'Gracias'), '')
  assert.equal(traduccionUtil('¡Gracias!', 'gracias'), '') // misma frase, distinta puntuación
  assert.equal(traduccionUtil('Merci beaucoup', 'Muchas gracias'), 'Muchas gracias')
})

test('línea 🔁 con traducción; sin ella, el hueco se declara solo cuando era imprescindible', () => {
  assert.equal(lineaTraduccion('Muchas gracias', true, esc), '\n<i>🔁 Muchas gracias</i>')
  assert.match(lineaTraduccion('', true, esc), /no he podido traducirlo/)
  assert.equal(lineaTraduccion('', false, esc), '')
})
