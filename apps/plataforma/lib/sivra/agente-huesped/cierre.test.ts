import { test } from 'node:test'
import assert from 'node:assert'
import { bloqueCierre, revisarCierre } from './cierre.ts'

// El caso real: Pilar, en plena estancia, pregunta dónde dejar las maletas el domingo y el agente
// cierra con «¡Que tengas un buen viaje!» (20/08/2026).
const RESPUESTA_PILAR = `Hola Pilar, ¡claro que sí! Aunque el apartamento no tiene servicio de consigna, te recomiendo estas opciones cercanas para guardar tus maletas:

• Lock & Explore – Castellar (a 2 min andando)

Ambos tienen taquillas automáticas disponibles 24/7. ¡Que tengas un buen viaje!`

test('en mitad de la estancia se poda el «buen viaje» y el resto del mensaje queda intacto', () => {
  const r = revisarCierre(RESPUESTA_PILAR, 'en-estancia', false)
  assert.equal(r.podado, true)
  assert.equal(r.incoherente, false)
  assert.ok(!/buen viaje/i.test(r.texto))
  assert.ok(r.texto.includes('Lock & Explore'))
  assert.ok(r.texto.includes('taquillas automáticas disponibles 24/7.'))
})

test('el día de salida y después, la despedida de viaje es correcta', () => {
  for (const [fase, diaSalida] of [['en-estancia', true], ['post-estancia', false]] as const) {
    const r = revisarCierre(RESPUESTA_PILAR, fase, diaSalida)
    assert.equal(r.podado, false, `${fase}/${diaSalida}`)
    assert.equal(r.incoherente, false, `${fase}/${diaSalida}`)
    assert.equal(r.texto, RESPUESTA_PILAR)
  }
})

test('antes de llegar, «buen viaje» vale (viene de camino) pero «hasta la próxima» no', () => {
  const ok = revisarCierre('Te esperamos el jueves. ¡Buen viaje!', 'pre-llegada', false)
  assert.equal(ok.podado, false)
  assert.equal(ok.incoherente, false)

  const mal = revisarCierre('Anotado, gracias. ¡Hasta la próxima!', 'dia-llegada', false)
  assert.equal(mal.podado, true)
  assert.ok(!/hasta la pr/i.test(mal.texto))
})

test('si la fórmula lleva contenido real dentro, NO se toca el texto: lo revisa Alberto', () => {
  const r = revisarCierre(
    'La consigna está en C/ Castellar 60A. Que tengas un buen viaje y avísame si necesitas que te reserve el traslado.',
    'en-estancia', false,
  )
  assert.equal(r.podado, false)
  assert.equal(r.incoherente, true)
  assert.equal(r.texto.includes('avísame si necesitas'), true)
})

test('un mensaje que es SOLO la despedida no se vacía: escala', () => {
  const r = revisarCierre('¡Que tengas un buen viaje!', 'en-estancia', false)
  assert.equal(r.podado, false)
  assert.equal(r.incoherente, true)
})

test('otros idiomas: safe travels / buon viaggio en plena estancia', () => {
  for (const t of ['The lockers are open 24/7. Have a safe trip!', 'Gli armadietti sono aperti 24/7. Buon viaggio!']) {
    const r = revisarCierre(t, 'en-estancia', false)
    assert.equal(r.podado, true, t)
    assert.ok(!/safe trip|buon viaggio/i.test(r.texto), t)
  }
})

test('un mensaje sin fórmulas de despedida pasa tal cual en cualquier fase', () => {
  const t = 'La contraseña del wifi es la que tienes en la guía. ¡Que disfrutéis de Sevilla!'
  for (const fase of ['pre-llegada', 'dia-llegada', 'en-estancia', 'post-estancia'] as const) {
    const r = revisarCierre(t, fase, false)
    assert.equal(r.texto, t)
    assert.equal(r.podado, false)
    assert.equal(r.incoherente, false)
  }
})

test('bloqueCierre dice lo contrario en estancia que el día de salida', () => {
  assert.match(bloqueCierre('en-estancia', false), /NO uses fórmulas de viaje/i)
  assert.match(bloqueCierre('en-estancia', true), /d[ií]a de salida/i)
  assert.match(bloqueCierre('post-estancia', false), /despedida/i)
  assert.match(bloqueCierre('pre-llegada', false), /HASTA AQUÍ/)
})
