import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preguntaPorCamas, declaraTipoDeCama, bloqueCamas } from './camas.ts'

test('preguntaPorCamas caza la pregunta REAL que destapó el fallo (16/09/2026)', () => {
  assert.equal(preguntaPorCamas("Hi, please confirm if there're at least two double beds in the apartment as we have 4 people in our group. Thanks!"), true)
})

test('preguntaPorCamas cubre los cinco idiomas del agente', () => {
  assert.equal(preguntaPorCamas('¿Cuántas camas de matrimonio hay?'), true)
  assert.equal(preguntaPorCamas('¿El salón tiene sofá cama?'), true)
  assert.equal(preguntaPorCamas('How many bedrooms does it have?'), true)
  assert.equal(preguntaPorCamas('What is the sleeping arrangement?'), true)
  assert.equal(preguntaPorCamas('Combien de lits doubles ?'), true)
  assert.equal(preguntaPorCamas('Ci sono due letti matrimoniali?'), true)
  assert.equal(preguntaPorCamas('Wie viele Betten gibt es?'), true)
})

test('preguntaPorCamas NO se dispara con el resto del tráfico del hilo', () => {
  assert.equal(preguntaPorCamas('¿A qué hora es el check-in?'), false)
  assert.equal(preguntaPorCamas('Can we park nearby?'), false)
  assert.equal(preguntaPorCamas('Muchas gracias, un saludo'), false)
  // La trampa: la capacidad NO es una pregunta por camas (y tampoco una respuesta).
  assert.equal(preguntaPorCamas('The apartment accommodates up to 4 guests'), false)
})

test('declaraTipoDeCama exige el TIPO, no la palabra «cama»', () => {
  assert.equal(declaraTipoDeCama('El dormitorio tiene una cama de matrimonio y el salón un sofá cama.'), true)
  assert.equal(declaraTipoDeCama('One double bed and two single beds.'), true)
  assert.equal(declaraTipoDeCama('Il y a deux lits doubles.'), true)
  // Lo que HOY pinta la ficha desde `properties`: número, no tipo. No puede pasar por respuesta.
  assert.equal(declaraTipoDeCama('Distribución: 1 dormitorio · 2 camas · 1 baño.'), false)
  assert.equal(declaraTipoDeCama('Capacidad máxima: 4 huéspedes'), false)
  assert.equal(declaraTipoDeCama(''), false)
})

test('bloqueCamas: sin dato NO inventa una línea (tres estados, no dos)', () => {
  assert.equal(bloqueCamas({}), '')
  assert.equal(bloqueCamas({ dormitorios: null, camas: null, banos: null }), '')
})

test('bloqueCamas declara lo que sabe Y lo que no sabe', () => {
  const b = bloqueCamas({ dormitorios: 1, camas: 2, banos: 1 })
  assert.match(b, /1 dormitorio · 2 camas · 1 baño/)
  // La barrera dentro del prompt: sin esto el modelo vuelve a contestar con la capacidad.
  assert.match(b, /TIPO de cada cama/)
  assert.match(b, /NO lo deduzcas de la capacidad/)
  // Y la línea que emite NO puede contar como «tipo declarado» ante `declaraTipoDeCama`.
  assert.equal(declaraTipoDeCama(b.replace(/⚠️[\s\S]*$/, '')), false)
})

test('bloqueCamas concuerda en singular/plural', () => {
  assert.match(bloqueCamas({ dormitorios: 6, camas: 6, banos: 4 }), /6 dormitorios · 6 camas · 4 baños/)
  assert.match(bloqueCamas({ camas: 1 }), /^Distribución: 1 cama\./)
})
