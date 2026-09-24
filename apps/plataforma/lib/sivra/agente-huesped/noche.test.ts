import test from 'node:test'
import assert from 'node:assert/strict'
import { esModoNoche, horaMadrid, esUrgenciaNocturna, textoAcuse, textoUltimoRecurso, MINUTOS_ULTIMO_RECURSO, HORARIO } from './noche.ts'
import { HORARIO_ATENCION, fueraDeHorarioAtencion } from './llegada.ts'

// El acuse le dice al huésped un horario, y la ficha del piso le dice otro al agente. Si divergen,
// le prometemos al huésped una hora a la que no hay nadie (o al revés) y nada falla.
test('el horario del modo noche no puede divergir del que ve el agente en la ficha', () => {
  assert.deepEqual({ ...HORARIO }, { ...HORARIO_ATENCION })
  for (let h = 0; h < 24; h++) {
    const d = new Date(Date.UTC(2026, 0, 15, h - 1))  // enero: Madrid = UTC+1
    assert.equal(esModoNoche(d), fueraDeHorarioAtencion(h), `hora ${h}`)
  }
})

// Enero (CET, UTC+1) y julio (CEST, UTC+2): el corte es en hora de España, no en UTC.
test('esModoNoche delimita 21:00–09:00 en hora de Madrid', () => {
  assert.equal(horaMadrid(new Date('2026-01-15T22:30:00Z')), 23)
  assert.equal(esModoNoche(new Date('2026-01-15T22:30:00Z')), true)   // 23:30 Madrid
  assert.equal(esModoNoche(new Date('2026-01-15T12:00:00Z')), false)  // 13:00 Madrid
  assert.equal(esModoNoche(new Date('2026-01-15T07:30:00Z')), true)   // 08:30 Madrid
  assert.equal(esModoNoche(new Date('2026-01-15T08:30:00Z')), false)  // 09:30 Madrid
  // Verano: 20:30 UTC son las 22:30 en Madrid → es de noche aunque en UTC aún no lo sea.
  assert.equal(esModoNoche(new Date('2026-07-15T20:30:00Z')), true)
  assert.equal(esModoNoche(new Date('2026-07-15T18:30:00Z')), false)  // 20:30 Madrid
})

test('esUrgenciaNocturna reconoce fallos de acceso en varios idiomas', () => {
  for (const t of [
    'Hola, no puedo entrar, el código no funciona',
    "Hi, we can't get in, the door won't open",
    'Bonjour, je ne peux pas entrer',
    'Non riesco a entrare, il codice non funziona',
    'Wir kommen nicht rein',
    'No hay luz en el apartamento',
    'There is a water leak in the bathroom',
  ]) assert.equal(esUrgenciaNocturna(t), true, t)
})

// Un falso positivo cuesta una notificación de madrugada; estos son mensajes normales que NO deben
// despertar a nadie. `fireworks`/`fireplace` estaban en la lista negra del regex por eso.
test('esUrgenciaNocturna NO se dispara con mensajes normales', () => {
  for (const t of [
    'Llegamos sobre las 23:30, ¿hay algún problema?',
    '¿A qué hora es el check-out?',
    'Are there fireworks tonight in Seville?',
    'Does the flat have a fireplace?',
    'Muchas gracias por todo, ha sido genial',
    '¿Podemos dejar las llaves en la mesa al salir?',
  ]) assert.equal(esUrgenciaNocturna(t), false, t)
})

test('el acuse sale en el idioma del huésped y distingue urgencia', () => {
  assert.match(textoAcuse('es', false), /fuera del horario de atención/)
  assert.match(textoAcuse('es', true), /avisado al anfitrión/)
  assert.match(textoAcuse('en', false), /support hours/)
  assert.match(textoAcuse('it', true), /host/)
  // Idioma desconocido → inglés, nunca cadena vacía: un acuse vacío es un huésped sin respuesta.
  assert.equal(textoAcuse('zz', false), textoAcuse('en', false))
  assert.ok(textoAcuse('', true).length > 20)
})

// El acuse NUNCA menciona el portal de reserva: eso es el último recurso y va después de intentar
// despertar a Alberto (el portal no puede abrir una puerta ni conoce el código de acceso).
test('el portal de reserva solo aparece en el último recurso', () => {
  for (const lang of ['es', 'en', 'fr', 'it', 'de', 'pt']) {
    assert.doesNotMatch(textoAcuse(lang, true), /Booking|Airbnb/)
    assert.match(textoUltimoRecurso(lang), /Booking/)
  }
})

test('la espera antes de derivar al portal es corta pero no instantánea', () => {
  assert.ok(MINUTOS_ULTIMO_RECURSO >= 10 && MINUTOS_ULTIMO_RECURSO <= 30)
})
