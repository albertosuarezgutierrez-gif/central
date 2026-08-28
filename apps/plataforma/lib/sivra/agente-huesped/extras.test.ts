import { test } from 'node:test'
import assert from 'node:assert'
import { detectarExtra, esAceptacion, importeSospechoso, eurDeCents, mencionaImporte } from './extras.ts'

test('detecta la cuna y la trona en los cinco idiomas del agente', () => {
  for (const t of [
    '¿tenéis cuna para el bebé?',
    'necesitaríamos una trona',
    'do you have a cot for the baby?',
    'is there a crib and a high chair?',
    'auriez-vous un lit bébé ?',
    'avez-vous une chaise haute',
    'habt ihr ein Kinderbett?',
    'gibt es einen Hochstuhl',
    'avete una culla?',
    'serve un seggiolone',
  ]) assert.equal(detectarExtra(t), 'cuna_trona', t)
})

test('un mensaje sin extras no dispara nada', () => {
  for (const t of ['¿a qué hora es la entrada?', 'where can I park?', 'gracias por todo']) {
    assert.equal(detectarExtra(t), null, t)
  }
})

test('acepta un sí limpio en los cinco idiomas', () => {
  for (const t of ['sí', 'ok', 'vale', 'perfecto, la queremos', 'yes please', 'sounds good', "d'accord", 'oui', 'ja gerne', 'va bene', 'perfetto']) {
    assert.equal(esAceptacion(t), true, t)
  }
})

test('una NEGACIÓN nunca es aceptación, aunque venga con gracias', () => {
  for (const t of ['no, gracias', 'no thanks', 'nein danke', 'non merci', 'al final no hace falta', 'ya no la necesitamos']) {
    assert.equal(esAceptacion(t), false, t)
  }
})

// El caso que motiva el guardrail: el huésped sigue negociando y eso NO es cerrar el trato.
test('una PREGUNTA no es aceptación aunque lleve un sí dentro', () => {
  for (const t of ['sí, ¿y cuánto cuesta?', 'ok but can we pay in cash?', '¿podéis poner dos cunas?']) {
    assert.equal(esAceptacion(t), false, t)
  }
})

test('un mensaje vacío o ambiguo se va a Telegram, no se auto-cobra', () => {
  for (const t of ['', '   ', 'mmm', 'lo hablamos al llegar']) {
    assert.equal(esAceptacion(t), false, JSON.stringify(t))
  }
})

test('el guardrail deja pasar el importe del catálogo y caza cualquier otro', () => {
  assert.equal(importeSospechoso('La cuna y la trona son 20€ por estancia.', [2000]), null)
  assert.equal(importeSospechoso('Son 20,00 euros en total', [2000]), null)
  assert.equal(importeSospechoso('serían €20', [2000]), null)
  // Una cifra inventada por el modelo: 25€ no está en el catálogo.
  assert.equal(importeSospechoso('te lo dejo en 25€', [2000]), 2500)
  assert.equal(importeSospechoso('are 15 EUR per night', [2000]), 1500)
})

test('un borrador sin importes no es sospechoso — no dar precio no es un fallo', () => {
  assert.equal(importeSospechoso('Claro, te la montamos antes de tu llegada.', [2000]), null)
  assert.equal(importeSospechoso('', [2000]), null)
})

// Regla global del CLAUDE.md raíz: el € va DETRÁS, decimales con coma y miles con punto.
test('el importe se formatea a la española', () => {
  assert.equal(eurDeCents(2000), '20,00€')
  assert.equal(eurDeCents(216249), '2.162,49€')
})

// Es lo que separa «Alberto aprobó un mensaje que COTIZA la cuna» de «un mensaje que la MENCIONA».
// Solo lo primero crea una oferta cobrable sin volver a preguntarle.
test('mencionaImporte exige la cifra exacta del catálogo', () => {
  assert.equal(mencionaImporte('La cuna y la trona son 20€ por estancia.', 2000), true)
  assert.equal(mencionaImporte('son 20,00 euros', 2000), true)
  assert.equal(mencionaImporte('It is €20 for the whole stay', 2000), true)
  // Habla de la cuna pero NO da precio → no hay oferta.
  assert.equal(mencionaImporte('Sí, tenemos cuna disponible.', 2000), false)
  // Da OTRO precio → tampoco: lo aprobado no es lo que dice el catálogo.
  assert.equal(mencionaImporte('te la dejo en 25€', 2000), false)
})
