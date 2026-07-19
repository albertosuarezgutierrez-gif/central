import { test } from 'node:test'
import assert from 'node:assert'
import { detectLang, detectCategory, extractEarlyTime, PARKING_SPOTS, esSolicitudLateCheckout } from './reglas.ts'

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
