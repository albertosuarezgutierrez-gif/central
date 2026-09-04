import { test } from 'node:test'
import assert from 'node:assert'
import { esCierre, respuestaSinDatos, esIntercambioDeCortesia } from './cortesia.ts'

// Caso fundacional (04/09/2026, reserva 152961026 de Esther): este mensaje se propuso para revisión
// en vez de salir solo porque la regex vieja solo admitía «muchas» y nada detrás de la fórmula.
test('esCierre — «Muchísimas gracias, un saludo» (caso Esther)', () => assert.equal(esCierre('Muchísimas gracias, un saludo'), true))
test('esCierre — «Gracias, un saludo»', () => assert.equal(esCierre('Gracias, un saludo'), true))
test('esCierre — sin tilde: «Muchisimas gracias»', () => assert.equal(esCierre('Muchisimas gracias'), true))
test('esCierre — «Mil gracias!!»', () => assert.equal(esCierre('Mil gracias!!'), true))
test('esCierre — encadenado: «Ok perfecto, gracias»', () => assert.equal(esCierre('Ok perfecto, gracias'), true))
test('esCierre — sigue valiendo lo de antes: «Muchas gracias»', () => assert.equal(esCierre('Muchas gracias'), true))
test('esCierre — con emoji: «Gracias 🙏😊»', () => assert.equal(esCierre('Gracias 🙏😊'), true))
test('esCierre — inglés: «Thank you so much, best regards»', () => assert.equal(esCierre('Thank you so much, best regards'), true))
test('esCierre — italiano: «Grazie, a presto»', () => assert.equal(esCierre('Grazie, a presto'), true))
test('esCierre — solo despedida: «Un saludo»', () => assert.equal(esCierre('Un saludo'), true))

// Anclado a propósito: en cuanto hay contenido real, NO es un cierre y vuelve a la vía normal.
test('esCierre — no: agradecimiento + pregunta', () => assert.equal(esCierre('Gracias, ¿a qué hora es el check-in?'), false))
test('esCierre — no: agradecimiento con contenido', () => assert.equal(esCierre('Muchas gracias por la información, un saludo'), false))
test('esCierre — no: queja envuelta en gracias', () => assert.equal(esCierre('Gracias, pero la ducha no calienta'), false))
test('esCierre — no: aceptación de un extra', () => assert.equal(esCierre('Perfecto, quiero la cuna'), false))
test('esCierre — no: vacío', () => assert.equal(esCierre('   '), false))

// Segunda mitad de la guarda: el borrador tampoco puede afirmar nada comprobable.
test('respuestaSinDatos — cálida y vacía de datos', () => assert.equal(respuestaSinDatos('¡De nada, Esther! Que tengas un buen viaje a Sevilla. ¡Un saludo!'), true))
test('respuestaSinDatos — no: lleva una hora', () => assert.equal(respuestaSinDatos('De nada. Recuerda que la salida es a las 11:00.'), false))
test('respuestaSinDatos — no: lleva un importe', () => assert.equal(respuestaSinDatos('De nada, son 20€.'), false))
test('respuestaSinDatos — no: lleva un enlace', () => assert.equal(respuestaSinDatos('De nada, mira https://housesevillana.es'), false))
test('respuestaSinDatos — no: anuncia una credencial', () => assert.equal(respuestaSinDatos('De nada. El wifi te lo dejo apuntado dentro.'), false))
test('respuestaSinDatos — no: vacía', () => assert.equal(respuestaSinDatos('  '), false))

// El par completo: es la ÚNICA condición que deja pasar un control de calidad caído.
test('esIntercambioDeCortesia — caso Esther completo', () =>
  assert.equal(esIntercambioDeCortesia('Muchísimas gracias, un saludo', '¡De nada, Esther! Que tengas un buen viaje. ¡Un saludo!'), true))
test('esIntercambioDeCortesia — no si el borrador suelta un dato', () =>
  assert.equal(esIntercambioDeCortesia('Muchas gracias', 'De nada, la entrada es a las 15:00.'), false))
test('esIntercambioDeCortesia — no si la pregunta pide algo', () =>
  assert.equal(esIntercambioDeCortesia('Gracias, ¿hay parking?', 'De nada, te cuento.'), false))
