import test from 'node:test'
import assert from 'node:assert/strict'
import { minutosAtencion, peldanoRancio, textoEspera, textosEsperaTodos, MIN_RECORDATORIO, MIN_ACUSE_ESPERA } from './rancio.ts'
import { esModoNoche } from './noche.ts'

// La cuenta del barrido y la franja del modo noche tienen que ser la MISMA franja. Si divergen, el
// barrido contaría como «tiempo de Alberto» horas en las que el modo noche dice que no hay nadie: le
// daría toques de madrugada y acusaría recibo al huésped por un silencio que no es silencio.
test('la franja que cuenta coincide con la del modo noche', () => {
  for (let h = 0; h < 24; h++) {
    const ini = new Date(Date.UTC(2026, 0, 15, h - 1))          // enero: Madrid = UTC+1
    const cuenta = minutosAtencion(ini, new Date(ini.getTime() + 60 * 60 * 1000)) > 0
    assert.equal(cuenta, !esModoNoche(ini), `hora ${h}`)
  }
})

test('minutosAtencion no cuenta la noche', () => {
  // 20:30 → 09:30 del día siguiente (Madrid, invierno): 30 min antes de las 21:00 + 30 después de
  // las 09:00. Las 12 h de noche no cuentan.
  const a = new Date('2026-01-15T19:30:00Z')  // 20:30 Madrid
  const b = new Date('2026-01-16T08:30:00Z')  // 09:30 Madrid
  assert.equal(minutosAtencion(a, b), 60)
})

test('minutosAtencion suma solo la franja dentro de un mismo día', () => {
  const a = new Date('2026-07-15T11:00:00Z')  // 13:00 Madrid (verano, UTC+2)
  const b = new Date('2026-07-15T13:30:00Z')  // 15:30 Madrid
  assert.equal(minutosAtencion(a, b), 150)
})

test('minutosAtencion recorta lo que cae fuera de horario por los dos extremos', () => {
  const a = new Date('2026-01-15T05:00:00Z')  // 06:00 Madrid (antes de abrir)
  const b = new Date('2026-01-15T22:00:00Z')  // 23:00 Madrid (después de cerrar)
  assert.equal(minutosAtencion(a, b), 12 * 60)  // el día entero de atención, ni un minuto más
})

test('minutosAtencion acumula varios días', () => {
  const a = new Date('2026-01-15T14:00:00Z')  // 15:00 Madrid → 6 h ese día
  const b = new Date('2026-01-17T09:00:00Z')  // 10:00 Madrid → 1 h ese día, 12 h el intermedio
  assert.equal(minutosAtencion(a, b), (6 + 12 + 1) * 60)
})

test('minutosAtencion es 0 hacia atrás y dentro de la misma noche', () => {
  assert.equal(minutosAtencion(new Date('2026-01-15T12:00:00Z'), new Date('2026-01-15T11:00:00Z')), 0)
  // 22:00 → 23:00 Madrid: la noche entera no suma nada.
  assert.equal(minutosAtencion(new Date('2026-01-15T21:00:00Z'), new Date('2026-01-15T22:00:00Z')), 0)
})

// El caso real que abrió esto: preguntó a las 15:41 y a las 21:00 del día siguiente seguía esperando.
test('el caso de la reserva 154375571 pide acuse, no recordatorio', () => {
  const preguntado = new Date('2026-09-05T13:42:00Z')  // 15:42 Madrid
  const alDiaSiguiente = new Date('2026-09-06T17:00:00Z')
  const min = minutosAtencion(preguntado, alDiaSiguiente)
  assert.ok(min > MIN_ACUSE_ESPERA, `${min} min de atención`)
  assert.equal(peldanoRancio({ minutos: min, recordado: false, acusado: false, noRequiereRespuesta: false }), 'acuse')
})

test('peldanoRancio: primero recordatorio, después acuse, y nada antes de tiempo', () => {
  const base = { recordado: false, acusado: false, noRequiereRespuesta: false }
  assert.equal(peldanoRancio({ ...base, minutos: MIN_RECORDATORIO - 1 }), null)
  assert.equal(peldanoRancio({ ...base, minutos: MIN_RECORDATORIO }), 'recordatorio')
  assert.equal(peldanoRancio({ ...base, minutos: MIN_ACUSE_ESPERA }), 'acuse')
  // Ya recordado pero aún no toca acusar: no se repite el toque.
  assert.equal(peldanoRancio({ ...base, minutos: MIN_ACUSE_ESPERA - 1, recordado: true }), null)
  // Ya acusado: no se vuelve a acusar aunque pasen días (si no, el hilo del huésped se llena).
  assert.equal(peldanoRancio({ ...base, minutos: 10000, recordado: true, acusado: true }), null)
  // Un pendiente muy viejo que nunca se recordó: el acuse manda sobre el recordatorio.
  assert.equal(peldanoRancio({ ...base, minutos: 10000 }), 'acuse')
})

// Una despedida no espera respuesta: ni se le da un toque a Alberto ni se le promete nada al huésped.
test('un cierre de conversación no da ningún peldaño', () => {
  assert.equal(peldanoRancio({ minutos: 10000, recordado: false, acusado: false, noRequiereRespuesta: true }), null)
})

test('el acuse de espera existe en todos los idiomas y no promete una hora', () => {
  for (const l of ['es', 'en', 'fr', 'it', 'de', 'pt', 'nl', '']) {
    const t = textoEspera(l)
    assert.ok(t.length > 40, l)
    assert.ok(!/\d{1,2}\s*(min|minut|hour|hora)/i.test(t), `${l} promete un plazo concreto: ${t}`)
  }
  assert.equal(textoEspera('nl'), textoEspera('en'))  // idioma desconocido → inglés
})

// Reserva 154692216: preguntó a las 18:14 si el piso estaba listo y el acuse le llegó a las 09:14 del
// día de salida. Ese día no se le promete respuesta; Alberto sí recibe el recordatorio.
test('peldanoRancio: el día de salida no hay acuse, solo recordatorio', () => {
  const base = { minutos: MIN_ACUSE_ESPERA + 10, acusado: false, noRequiereRespuesta: false }
  assert.equal(peldanoRancio({ ...base, recordado: false, estanciaAcabando: true }), 'recordatorio')
  assert.equal(peldanoRancio({ ...base, recordado: true, estanciaAcabando: true }), null)
  // Sin fecha fiable se acusa como siempre: callar ante quien espera es el fallo caro.
  assert.equal(peldanoRancio({ ...base, recordado: true, estanciaAcabando: undefined }), 'acuse')
  assert.equal(peldanoRancio({ ...base, recordado: true, estanciaAcabando: false }), 'acuse')
})

// El acuse reaparece en el hilo de Smoobu sin marca de emisor. Si no está entre «lo que enviamos», el
// agente lo toma por una pregunta del huésped y le redacta una respuesta (cinco ecos en 154692216).
test('los acuses de espera y de noche cuentan como mensajes nuestros', async () => {
  const { setEnviados, esEcoPropio } = await import('./atribucion.ts')
  const { textosNocheTodos, textoAcuse, textoUltimoRecurso } = await import('./noche.ts')
  const enviados = setEnviados([...textosEsperaTodos(), ...textosNocheTodos()])
  for (const lang of ['es', 'en', 'fr', 'it', 'de', 'pt']) {
    assert.ok(esEcoPropio(textoEspera(lang), enviados), `espera ${lang}`)
    assert.ok(esEcoPropio(textoAcuse(lang, false), enviados), `acuse ${lang}`)
    assert.ok(esEcoPropio(textoAcuse(lang, true), enviados), `acuse urgente ${lang}`)
    assert.ok(esEcoPropio(textoUltimoRecurso(lang), enviados), `último recurso ${lang}`)
  }
})

// Todo lo que sale hacia el huésped pasa por `enviarAlHuespedDetallado`; si deja de anotarlo, los
// mensajes programados y lo que Alberto edita antes de enviar vuelven a leerse como preguntas.
test('enviar.ts anota cada envío con éxito en mensajes_enviados y contexto.ts lo lee', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./enviar.ts', import.meta.url), 'utf8')
  const tramoOk = src.slice(src.indexOf('if (r.ok)'), src.indexOf('const detalle'))
  assert.match(tramoOk, /registrarEnviado\(/)
  assert.match(src, /INSERT INTO mensajes_enviados/)
  const ctx = readFileSync(new URL('./contexto.ts', import.meta.url), 'utf8')
  assert.match(ctx, /FROM mensajes_enviados/)
  assert.match(ctx, /textosEsperaTodos\(\)/)
  assert.match(ctx, /textosNocheTodos\(\)/)
})
