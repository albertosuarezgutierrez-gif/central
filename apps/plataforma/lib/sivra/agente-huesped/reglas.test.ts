import { test } from 'node:test'
import assert from 'node:assert'
import { detectLang, detectCategory, extractEarlyTime, PARKING_SPOTS } from './reglas.ts'

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
