// Los casos de este test son filas REALES de `mensajes_aprendizaje` (leídas de producción el
// 04/09/2026), no ejemplos inventados: el filtro existe por lo que esas filas contienen de verdad.
import { test } from 'node:test'
import assert from 'node:assert'
import { juzgarPrecedente, precedentesEstables, bloquePrecedentes, MAX_PRECEDENTES } from './precedentes.ts'

const a = (pregunta_norm: string, respuesta_final: string) => ({ categoria: 'general', pregunta_norm, respuesta_final })

test('acepta el conocimiento estable del piso', () => {
  assert.equal(juzgarPrecedente(a('qué tipo de cafetera?', 'La cafetera que dispone el alojamiento es una cafetera convencional italiana')).util, true)
  // El caso que Alberto citó: el phishing, enseñado varias veces y escalando igual.
  assert.equal(juzgarPrecedente(a(
    'saben que me han contactado en su nombre pidiendo datos',
    'Please rest assured that we only ever contact our guests through Booking.com messages, never by WhatsApp or SMS.',
  )).util, true)
})

test('descarta lo que valía para ESA reserva y ese día', () => {
  const casos: Array<[string, string, string]> = [
    ['fecha concreta', 'está confirmada la reserva?', '¡Hola, Esther! Sí, tu reserva está hecha y confirmada para las fechas del 20 al 22 de noviembre de 2026.'],
    ['importe', 'me confirmas el bizum?', 'Acabo de comprobarlo y sí, me aparece el Bizum de 20 € recibido correctamente.'],
    ['hora concreta', 'podremos salir a las 12:00 o a las 13:00?', 'Confirmado que puedes salir a las 12:00 sin problema, ya que no entra nadie después de ti.'],
    ['disponibilidad', 'podríamos entrar antes de las tres?', 'Lo siento, pero la noche anterior el apartamento está ocupado por otros huéspedes.'],
    ['dato de contacto', 'cómo os aviso si llego tarde?', 'Puedes escribirme al +34 637 00 00 00 cuando llegues.'],
  ]
  for (const [, pregunta, respuesta] of casos) {
    const v = juzgarPrecedente(a(pregunta, respuesta))
    assert.equal(v.util, false, `debería descartarse: ${respuesta}`)
    assert.ok(v.motivo, 'un descarte sin motivo no se puede depurar')
  }
})

test('una respuesta que MEZCLA conocimiento estable con algo volátil se descarta entera', () => {
  // No se puede partir sin adivinar qué mitad juzga el control: la lista de parkings sirve siempre,
  // «nuestro parking ya está ocupado» solo servía ese día.
  const v = juzgarPrecedente(a('dónde aparco?', 'Lo siento, nuestro parking ya está ocupado. Aquí tienes opciones cercanas: Parking José Laguillo, Parking Plaza de Armas.'))
  assert.equal(v.util, false)
})

test('un mensaje de pura cortesía no es un precedente: no se preguntó nada', () => {
  assert.equal(juzgarPrecedente(a('gracias', 'Un placer, que tengas buena estancia')).util, false)
  assert.equal(juzgarPrecedente(a('muchísimas gracias, un saludo', 'Un placer, que tengas buen viaje')).util, false)
})

// Límite CONOCIDO y medido: `esCierre` está anclado y no reconoce las cortesías con ruido alrededor
// («ook! thank you!», «hello thank you», «merci a vous» — las tres son filas reales), así que esos
// pares se cuelan como precedentes. Se deja así a propósito: `esCierre` gobierna también el
// auto-envío de cortesía, y ensancharlo desde aquí movería una guarda de envío para arreglar un
// filtro de lectura. El daño es acotado: un precedente vacío no aporta NINGÚN dato al control —
// solo ocupa una de las cuatro plazas, que van ordenadas por parecido con la pregunta.
test('límite conocido: la cortesía con ruido alrededor se cuela, y es inocua', () => {
  assert.equal(juzgarPrecedente(a('ook! thank you!', 'You are very welcome!')).util, true)
  assert.equal(juzgarPrecedente(a('merci a vous', 'Avec plaisir !')).util, true)
})

test('sin pregunta o sin respuesta no hay precedente', () => {
  assert.equal(juzgarPrecedente(a('', 'algo')).util, false)
  assert.equal(juzgarPrecedente(a('algo', '   ')).util, false)
})

test('precedentesEstables respeta el orden de entrada (ya viene por pertinencia) y el tope', () => {
  const muchos = Array.from({ length: 10 }, (_, i) => a(`pregunta ${String.fromCharCode(97 + i)}`, `Respuesta estable número ${'x'.repeat(i)}`))
  const out = precedentesEstables(muchos)
  assert.equal(out.length, MAX_PRECEDENTES)
  assert.equal(out[0].pregunta, 'pregunta a')
})

test('lista vacía o ausente devuelve [] — el control se queda como estaba', () => {
  assert.deepEqual(precedentesEstables([]), [])
  assert.deepEqual(precedentesEstables(undefined), [])
  assert.equal(bloquePrecedentes([]), '')
})

test('el bloque del prompt DECLARA que no son fuente de datos', () => {
  const bloque = bloquePrecedentes(precedentesEstables([a('qué cafetera hay?', 'Es una cafetera italiana convencional')]))
  assert.match(bloque, /PRECEDENTES/)
  assert.match(bloque, /NO son fuente de datos/i)
  assert.match(bloque, /NO escales/i)
  assert.match(bloque, /cafetera italiana/)
})

test('un precedente larguísimo se recorta: el prompt del control es corto a propósito', () => {
  const carta = `Hola. ${'Texto larguísimo. '.repeat(60)}`
  const [p] = precedentesEstables([a('una pregunta cualquiera', carta)])
  assert.ok(p.respuesta.length <= 300, `se coló un precedente de ${p.respuesta.length} caracteres`)
  assert.ok(p.respuesta.endsWith('…'), 'un recorte tiene que verse como recorte')
})
