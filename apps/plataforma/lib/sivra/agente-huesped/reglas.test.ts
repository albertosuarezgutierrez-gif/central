import { test } from 'node:test'
import assert from 'node:assert'
import { detectLang, detectCategory, extractEarlyTime, PARKING_SPOTS, esSolicitudLateCheckout, esDespedida, esHechoDelPiso, tipoHueco, contieneDatoPersonal, interpretarDestilado } from './reglas.ts'

test('detectLang detecta español', () => assert.equal(detectLang('Hola, ¿a qué hora es el check-in?'), 'es'))
test('detectLang cae a inglés', () => assert.equal(detectLang('What is the wifi password?'), 'en'))
test('detectLang español sin tildes', () => assert.equal(detectLang('Nos iremos sobre las 10.30'), 'es'))
test('detectLang inglés gana al fallback es', () => assert.equal(detectLang("I'd like to request check-in at 15:00. Is this ok?", 'es'), 'en'))
test('detectLang ambiguo usa fallback', () => assert.equal(detectLang('👍', 'es'), 'es'))
test('detectCategory wifi', () => assert.equal(detectCategory('what is the wifi password'), 'wifi'))
test('detectCategory parking', () => assert.equal(detectCategory('¿hay aparcamiento?'), 'parking'))
test('extractEarlyTime checkout temprano', () => {
  assert.deepEqual(extractEarlyTime('we leave at 9'), { type: 'early_checkout', time: '09:00' })
})
test('PARKING_SPOTS conocido', () => assert.equal(PARKING_SPOTS['prop_house_sevillana'], 1))

test('esSolicitudLateCheckout: petición típica ES con comparación de horas', () =>
  assert.equal(esSolicitudLateCheckout('Sería posible salir el domingo a las 12:00 en vez de las 11:00?'), true))
test('esSolicitudLateCheckout: pregunta meramente informativa NO dispara', () =>
  assert.equal(esSolicitudLateCheckout('¿A qué hora es el check-out?'), false))
test('esSolicitudLateCheckout: pregunta informativa EN NO dispara', () =>
  assert.equal(esSolicitudLateCheckout('What time is checkout?'), false))
test('esSolicitudLateCheckout: "late check-out" explícito EN', () =>
  assert.equal(esSolicitudLateCheckout('Could we do a late check-out?'), true))
test('esSolicitudLateCheckout: "más tarde" ES', () =>
  assert.equal(esSolicitudLateCheckout('¿Podríamos salir un poco más tarde?'), true))
test('esSolicitudLateCheckout: "later than" EN con hora', () =>
  assert.equal(esSolicitudLateCheckout('Can we leave a bit later than 11am?'), true))
test('esSolicitudLateCheckout: "instead of" EN con horas', () =>
  assert.equal(esSolicitudLateCheckout('Is it possible to check out at 1pm instead of 11am?'), true))
test('esSolicitudLateCheckout: "quedarnos más tiempo" ES', () =>
  assert.equal(esSolicitudLateCheckout('Nos podemos quedar un poco más de tiempo?'), true))
test('esSolicitudLateCheckout: FR "partir plus tard"', () =>
  assert.equal(esSolicitudLateCheckout('Bonjour, pouvons-nous partir plus tard?'), true))
test('esSolicitudLateCheckout: cierre de cortesía NO dispara', () =>
  assert.equal(esSolicitudLateCheckout('Gracias por todo, un saludo'), false))
test('esSolicitudLateCheckout: mensaje sin relación NO dispara', () =>
  assert.equal(esSolicitudLateCheckout('¿Hay wifi?'), false))

// --- esDespedida (cortesía de fin de estancia auto-enviable) ---
test('esDespedida: "ya hemos dejado el Dúplex" (caso Redondo)', () =>
  assert.equal(esDespedida('ya hemos dejado el Dúplex'), true))
test('esDespedida: "Hemos dejado el apartamento, muchas gracias"', () =>
  assert.equal(esDespedida('Hemos dejado el apartamento, muchas gracias'), true))
test('esDespedida: "ya nos hemos ido"', () =>
  assert.equal(esDespedida('Buenas, ya nos hemos ido'), true))
test('esDespedida: agradecimiento "gracias por todo, ha sido genial"', () =>
  assert.equal(esDespedida('Muchas gracias por todo, ha sido genial'), true))
test('esDespedida: valoración "todo perfecto"', () =>
  assert.equal(esDespedida('Todo perfecto, un saludo'), true))
test('esDespedida: "nos ha encantado"', () =>
  assert.equal(esDespedida('El piso nos ha encantado'), true))
test('esDespedida: EN "we\'ve checked out, thanks for everything"', () =>
  assert.equal(esDespedida("We've checked out, thanks for everything!"), true))
test('esDespedida: EN "everything was perfect"', () =>
  assert.equal(esDespedida('Everything was perfect, thank you'), true))
test('esDespedida: EN "we had a wonderful stay"', () =>
  assert.equal(esDespedida('We had a wonderful stay'), true))
test('esDespedida: FR "merci pour tout"', () =>
  assert.equal(esDespedida('Merci pour tout, au revoir'), true))
test('esDespedida: pregunta operativa NO dispara', () =>
  assert.equal(esDespedida('¿A qué hora es el check-out?'), false))
test('esDespedida: petición de salir temprano NO dispara', () =>
  assert.equal(esDespedida('Necesitamos salir a las 8, ¿es posible?'), false))
test('esDespedida: plan de salida futuro NO dispara', () =>
  assert.equal(esDespedida('Mañana salimos temprano'), false))
test('esDespedida: pregunta de wifi NO dispara', () =>
  assert.equal(esDespedida('¿Cuál es la contraseña del wifi?'), false))

test('esHechoDelPiso: una pregunta real con respuesta con sustancia SÍ es un hecho', () => {
  assert.equal(esHechoDelPiso('¿Dónde dejo las llaves?', 'Déjalas en la mesa alta de la cocina y cierra la puerta.'), true)
  assert.equal(esHechoDelPiso('Where can I park?', 'There is a public car park on Plaza San Juan de la Palma, five minutes away.'), true)
})

test('esHechoDelPiso: cortesías y acuses NO son hechos', () => {
  assert.equal(esHechoDelPiso('Muchas gracias por todo', 'Gracias a ti, ha sido un placer recibirte en Sevilla.'), false)
  assert.equal(esHechoDelPiso('¿Puedo llegar a las 18:00?', 'Ok'), false)
  assert.equal(esHechoDelPiso('', 'Las llaves están en la caja del portal, con el código de tu reserva.'), false)
})

test('esHechoDelPiso: una afirmación del huésped sin pregunta no enseña nada', () => {
  assert.equal(esHechoDelPiso('Llegamos sobre las seis de la tarde', 'Perfecto, tomo nota de vuestra llegada sobre las 18:00.'), false)
})

// ── tipoHueco: hueco de guía vs control de calidad caído ───────────────────
test('tipoHueco: "no cubre" es hueco de guía', () => {
  assert.equal(tipoHueco({
    needs_human: true, apoyada_en_fuente: false, categoria: 'general', sentimiento: 'neutro',
    motivo: 'la respuesta no cubre bien la pregunta — quizá falta en la guía del piso',
  }), 'guia')
})

test('tipoHueco: el control caído NO es un hueco de guía (caso Claudio, 02/09/2026)', () => {
  assert.equal(tipoHueco({
    needs_human: true, apoyada_en_fuente: false, categoria: 'general', sentimiento: 'neutro',
    motivo: 'no se pudo verificar el borrador (control de calidad caído) — lo reviso yo',
  }), 'control_caido')
})

test('tipoHueco: si el motivo mezcla los dos, gana el que NO se pudo mirar', () => {
  assert.equal(tipoHueco({
    needs_human: true, apoyada_en_fuente: false, motivo: 'la respuesta no cubre bien la pregunta · no se pudo verificar el borrador',
  }), 'control_caido')
})

test('tipoHueco: lo sensible y las recomendaciones no son ignorancia', () => {
  assert.equal(tipoHueco({ needs_human: true, apoyada_en_fuente: false, sentimiento: 'negativo', motivo: 'no cubre' }), 'ninguno')
  assert.equal(tipoHueco({ needs_human: true, apoyada_en_fuente: false, categoria: 'recomendacion', motivo: 'no cubre' }), 'ninguno')
  assert.equal(tipoHueco({ needs_human: true, apoyada_en_fuente: true, motivo: 'no cubre' }), 'ninguno')
  assert.equal(tipoHueco(null), 'ninguno')
})

// ── contieneDatoPersonal / interpretarDestilado ────────────────────────────
test('contieneDatoPersonal caza el móvil de Bizum que se guardó como hecho (id=3)', () => {
  assert.equal(contieneDatoPersonal('Mi movil es +34637349990'), true)
  assert.equal(contieneDatoPersonal('Escríbenos a hola@ejemplo.com'), true)
  assert.equal(contieneDatoPersonal('El apartamento tiene una plaza de parking privada.'), false)
})

test('interpretarDestilado: NADA, cartas y datos personales no se guardan', () => {
  assert.equal(interpretarDestilado('NADA'), '')
  assert.equal(interpretarDestilado('  '), '')
  assert.equal(interpretarDestilado('ok'), '')
  assert.equal(interpretarDestilado('Llama al +34637349990 para el Bizum.'), '')
  assert.equal(interpretarDestilado('¡Hola, Claudio!\nGracias por escribirnos.\nUn saludo.'), '')
})

test('interpretarDestilado: una frase limpia sí se guarda, sin comillas', () => {
  assert.equal(
    interpretarDestilado('"Solo se contacta a los huéspedes por los mensajes de Booking, nunca por WhatsApp."'),
    'Solo se contacta a los huéspedes por los mensajes de Booking, nunca por WhatsApp.',
  )
})
