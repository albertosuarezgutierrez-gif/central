import { test } from 'node:test'
import assert from 'node:assert'
import { revisarCoherencia, REGLA_COHERENCIA } from './coherencia.ts'

// El mensaje real auto-enviado a Pilar (20/08/2026).
const PILAR = `Hola Pilar, ¡claro que sí! Aunque el apartamento no tiene servicio de consigna, te recomiendo estas opciones cercanas para guardar tus maletas:

• Lock & Explore – Castellar (a 2 min andando)

Ambos tienen taquillas automáticas disponibles 24/7.`

test('«claro que sí» + «no tiene servicio de consigna» = incoherente', () => {
  const r = revisarCoherencia(PILAR)
  assert.equal(r.incoherente, true)
  assert.match(r.concesion, /claro que s[ií]/i)
})

test('la misma respuesta, abriendo por lo que hay de verdad, pasa', () => {
  const r = revisarCoherencia(
    'Hola Pilar, nosotros no tenemos consigna en el apartamento, pero a dos minutos tienes taquillas automáticas 24/7 en C/ Castellar 60A.',
  )
  assert.equal(r.incoherente, false)
})

test('conceder algo que SÍ damos no es incoherente aunque el mensaje lleve un «no»', () => {
  for (const t of [
    '¡Claro que sí, Marta! Puedes entrar a partir de las 14:00, no hay problema.',
    'Por supuesto, te dejo el código de la caja. No dudes en escribirme si algo falla.',
  ]) {
    assert.equal(revisarCoherencia(t).incoherente, false, t)
  }
})

test('la concesión solo cuenta si abre el mensaje, no si aparece al final', () => {
  const r = revisarCoherencia(
    'El apartamento no dispone de servicio de consigna. Si quieres que te reserve yo la taquilla, claro que sí.',
  )
  assert.equal(r.incoherente, false)
})

test('inglés: «of course» + «we don\'t have» también chirría', () => {
  const r = revisarCoherencia("Hi Pilar, of course! Although we don't have luggage storage at the apartment, there are lockers nearby.")
  assert.equal(r.incoherente, true)
})

test('un mensaje sin concesión pasa siempre', () => {
  assert.equal(revisarCoherencia('El apartamento no ofrece consigna; te paso dos taquillas cercanas.').incoherente, false)
  assert.equal(revisarCoherencia('').incoherente, false)
})

test('la regla del prompt prohíbe abrir concediendo lo que se niega', () => {
  assert.match(REGLA_COHERENCIA, /NUNCA abras concediéndolo/)
})
