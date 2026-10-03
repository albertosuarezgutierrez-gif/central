import { test } from 'node:test'
import assert from 'node:assert'
import {
  evaluarCambioHorario, peticionCambioHorario, extraerHoraPedida, contraoferta, botonesCambioHorario,
  horaDeCallback, textoAceptacion, textoNegativa, tareaLimpieza, resolverTipo, LIMITE_CALLBACK,
  BLOQUE_PROMPT_CAMBIO_HORARIO, type ReservaHorario,
} from './cambio-horario.ts'
import { decidirAutoEnvio } from './auto.ts'
import type { Decision } from './decidir.ts'

const R = (id: string, checkIn: string | null, checkOut: string | null): ReservaHorario => ({ reservationId: id, checkIn, checkOut, huesped: 'Otro Huésped' })
const mia = R('100', '2026-10-01', '2026-10-03')

// ── Semáforo ──
test('salida tardía con OTRA entrada el día del check-out → ROJO y trae la colindante', () => {
  const ev = evaluarCambioHorario({ tipo: 'salida', reserva: mia, reservasMismaPropiedad: [mia, R('200', '2026-10-03', '2026-10-06')] })
  assert.equal(ev.semaforo, 'rojo')
  assert.equal(ev.colindante?.reservationId, '200')
  assert.equal(ev.colindante?.relacion, 'entra_mismo_dia')
})

test('salida tardía sin entrada ese día → AMARILLO (OK de limpieza), nunca verde', () => {
  const ev = evaluarCambioHorario({ tipo: 'salida', reserva: mia, reservasMismaPropiedad: [mia, R('200', '2026-10-04', '2026-10-06')] })
  assert.equal(ev.semaforo, 'amarillo')
  assert.match(ev.motivo, /limpieza/)
})

test('entrada anticipada con OTRA reserva que SALE ese día → ROJO (solo maletas)', () => {
  const ev = evaluarCambioHorario({ tipo: 'entrada', reserva: mia, reservasMismaPropiedad: [R('50', '2026-09-28', '2026-10-01')] })
  assert.equal(ev.semaforo, 'rojo')
  assert.equal(ev.colindante?.relacion, 'sale_mismo_dia')
  assert.match(ev.motivo, /maletas/)
})

test('entrada anticipada con la noche anterior vacía → VERDE', () => {
  const ev = evaluarCambioHorario({ tipo: 'entrada', reserva: mia, reservasMismaPropiedad: [mia, R('50', '2026-09-25', '2026-09-30')] })
  assert.equal(ev.semaforo, 'verde')
})

test('DESCONOCIDO → amarillo, jamás verde (lista null, fecha null o reserva con fechas null)', () => {
  assert.equal(evaluarCambioHorario({ tipo: 'entrada', reserva: mia, reservasMismaPropiedad: null }).semaforo, 'amarillo')
  assert.equal(evaluarCambioHorario({ tipo: 'salida', reserva: mia, reservasMismaPropiedad: null }).semaforo, 'amarillo')
  assert.equal(evaluarCambioHorario({ tipo: 'entrada', reserva: R('100', null, null), reservasMismaPropiedad: [] }).semaforo, 'amarillo')
  assert.equal(evaluarCambioHorario({ tipo: 'entrada', reserva: mia, reservasMismaPropiedad: [R('9', null, '2026-09-30')] }).semaforo, 'amarillo')
  assert.equal(evaluarCambioHorario({ tipo: 'salida', reserva: mia, reservasMismaPropiedad: [R('9', null, null)] }).semaforo, 'amarillo')
})

test('un rojo conocido manda sobre una reserva con fechas desconocidas', () => {
  const ev = evaluarCambioHorario({ tipo: 'salida', reserva: mia, reservasMismaPropiedad: [R('9', null, null), R('200', '2026-10-03', '2026-10-05')] })
  assert.equal(ev.semaforo, 'rojo')
})

// ── Compuerta: nunca auto-envío ──
test('el caso real del 03/10: «equipaje hasta las 15:00 el día de salida» se detecta', () => {
  assert.ok(peticionCambioHorario('¿Podemos dejar el equipaje y quedarnos hasta las 15:00 el día de salida?', 'equipaje'))
  assert.ok(peticionCambioHorario('¿Podemos quedarnos hasta las 15:00 el día de salida?', 'general'))
})

test('detección multilingüe ES/EN/IT/FR/DE', () => {
  const casos: Array<[string, 'entrada' | 'salida' | 'equipaje']> = [
    ['¿Podemos entrar antes de las 15?', 'entrada'], ['Could we have an early check-in?', 'entrada'],
    ['Possiamo fare il check-in anticipato?', 'entrada'], ['Peut-on faire un enregistrement anticipé ?', 'entrada'],
    ['Können wir früher einchecken?', 'entrada'],
    ['¿Podemos salir más tarde?', 'salida'], ['Can we get a late check-out?', 'salida'],
    ['Possiamo partire più tardi?', 'salida'], ['Peut-on partir plus tard ?', 'salida'],
    ['Können wir länger bleiben?', 'salida'], ['Can we stay until 3pm on the last day?', 'salida'],
    ['¿Dónde dejamos las maletas?', 'equipaje'], ['Can we leave our luggage?', 'equipaje'],
    ['Possiamo lasciare le valigie?', 'equipaje'], ['Peut-on laisser nos bagages ?', 'equipaje'],
    ['Können wir das Gepäck lassen?', 'equipaje'],
  ]
  for (const [txt, tipo] of casos) assert.equal(peticionCambioHorario(txt, null)?.tipo, tipo, txt)
  assert.equal(peticionCambioHorario('¿Cuál es la clave del wifi?', 'wifi'), null)
  assert.equal(peticionCambioHorario('Muchas gracias por todo', 'general'), null)
})

test('detección: falsos positivos descartados y variantes con verbo detectadas', () => {
  assert.equal(peticionCambioHorario('¿hay ascensor para las maletas?', null), null)
  assert.equal(peticionCambioHorario('we stay until Sunday', null), null)
  assert.equal(peticionCambioHorario('We will arrive early in the morning to Seville', null), null)
  assert.equal(peticionCambioHorario('nos quedamos hasta el domingo', null), null)
  assert.ok(peticionCambioHorario('can we leave our bags until 3pm', null))
  assert.ok(peticionCambioHorario('¿podemos guardar las maletas?', null))
  assert.ok(peticionCambioHorario('we arrive early, can we get into the room at 10am?', null))
  assert.ok(peticionCambioHorario('¿podemos quedarnos hasta las 15?', null))
})

test('las categorías early_checkin / late_checkout / equipaje siempre cuentan', () => {
  assert.equal(peticionCambioHorario('ok', 'early_checkin')?.tipo, 'entrada')
  assert.equal(peticionCambioHorario('ok', 'late_checkout')?.tipo, 'salida')
  assert.equal(peticionCambioHorario('ok', 'equipaje')?.tipo, 'equipaje')
})

test('decidirAutoEnvio NO envía solo una petición de horario aunque todo lo demás esté en verde', () => {
  const dec: Decision = { reply: 'Claro, sin problema.', confidence: 0.9, needs_human: false, requiere_respuesta: true, es_cortesia: false, apoyada_en_fuente: true, categoria: 'equipaje', sentimiento: 'neutro', motivo: '', fuente: 'ia' }
  assert.deepEqual(decidirAutoEnvio(dec, '¿Podemos dejar el equipaje hasta las 15:00?'), { auto: false, via: null })
  assert.deepEqual(decidirAutoEnvio({ ...dec, categoria: 'equipaje' }, ''), { auto: false, via: null })
  // …y una pregunta normal sigue pudiendo salir sola (la compuerta no se lo lleva todo)
  assert.equal(decidirAutoEnvio({ ...dec, categoria: 'wifi' }, '¿Cuál es el wifi?').auto, true)
})

// ── Hora, contraoferta, botones ──
test('extraerHoraPedida', () => {
  assert.equal(extraerHoraPedida('hasta las 15:00 el día de salida'), '15:00')
  assert.equal(extraerHoraPedida('quedarnos hasta las 14'), '14:00')
  assert.equal(extraerHoraPedida('can we stay until 3pm'), '15:00')
  assert.equal(extraerHoraPedida('um 13.30 Uhr'), '13:30')
  assert.equal(extraerHoraPedida('somos 2 personas con 3 maletas'), null)
  assert.equal(extraerHoraPedida('el 03/10 salimos'), null)
})

test('contraoferta: 13 o 14, y null si coincide con lo pedido', () => {
  assert.equal(contraoferta('salida', '15:00'), 14)
  assert.equal(contraoferta('salida', '14:00'), 13)
  assert.equal(contraoferta('salida', null), 13)
  assert.equal(contraoferta('salida', '13:00'), null)
  assert.equal(contraoferta('entrada', '12:00'), 13)
  assert.equal(contraoferta('entrada', '13:00'), 14)
})

test('botones: prefijo hsp_, callback ≤ 64 bytes, sin «solo maletas», rojo sin «sí»', () => {
  const idLargo = '1'.repeat(30)
  for (const semaforo of ['verde', 'amarillo', 'rojo'] as const) {
    const filas = botonesCambioHorario({ bookingId: idLargo, tipo: 'salida', semaforo, horaPedida: '15:00' })
    for (const b of filas.flat()) {
      assert.ok(b.callback.startsWith('hsp_'), b.callback)
      assert.ok(Buffer.byteLength(b.callback, 'utf8') <= LIMITE_CALLBACK, b.callback)
      assert.ok(Buffer.byteLength(b.callback, 'utf8') <= 64, b.callback)
      assert.ok(!/maletas/i.test(b.texto), b.texto)
    }
    const textos = filas.flat().map(b => b.texto)
    assert.ok(textos.includes('❌ No') && textos.includes('🧹 Consultar limpieza'))
    assert.equal(textos.some(t => t.startsWith('✅ Sí')), semaforo !== 'rojo')
  }
  const v = botonesCambioHorario({ bookingId: '123', tipo: 'salida', semaforo: 'amarillo', horaPedida: '15:00' }).flat()
  assert.deepEqual(v.slice(0, 2).map(b => b.texto), ['✅ Sí, 15:00', '🕐 Sí, hasta 14'])
  assert.equal(v[0].callback, 'hsp_chsi:123:1500')
  assert.equal(horaDeCallback('1500'), '15:00')
  assert.equal(horaDeCallback('14'), '14:00')
  assert.equal(horaDeCallback('x'), null)
})

test('resolverTipo: equipaje antes de entrar / después de salir', () => {
  const eq = { tipo: 'equipaje' as const }
  assert.equal(resolverTipo(eq, 'dejar las maletas antes del check-in', { hoy: '2026-10-03', checkIn: '2026-10-01' }), 'entrada')
  assert.equal(resolverTipo(eq, 'dejar el equipaje', { hoy: '2026-09-20', checkIn: '2026-10-01' }), 'entrada')
  assert.equal(resolverTipo(eq, 'dejar el equipaje', { hoy: '2026-10-03', checkIn: '2026-10-01' }), 'salida')
})

// ── Textos: gratis, sin reseña, consignas sin inventar ──
test('ningún texto menciona coste/precio/suplemento ni pide reseña', () => {
  const textos = [
    textoAceptacion({ tipo: 'salida', hora: '15:00', nombre: 'Marta Pérez' }),
    textoAceptacion({ tipo: 'entrada', hora: '12:00' }),
    textoNegativa({ tipo: 'salida', semaforo: 'rojo', propertyId: 'prop_house_sevillana' }),
    textoNegativa({ tipo: 'entrada', semaforo: 'rojo', propertyId: 'all' }),
    textoNegativa({ tipo: 'salida', semaforo: 'amarillo', propertyId: 'prop_duplex_center', ofrecerMaletas: true }),
  ]
  for (const t of textos) {
    assert.doesNotMatch(t, /coste|costo|precio|suplemento|tarifa|cargo|€|euro|gratis|reseña|valoraci/i, t)
  }
  assert.match(textos[0], /^Hola Marta:/)
})

test('el «no» rojo ofrece consignas de la zona; sin zona, texto genérico (nada inventado)', () => {
  assert.match(textoNegativa({ tipo: 'salida', semaforo: 'rojo', propertyId: 'prop_house_sevillana' }), /Castellar/)
  assert.match(textoNegativa({ tipo: 'salida', semaforo: 'rojo', propertyId: 'prop_duplex_center' }), /Plaza del Duque/)
  const g = textoNegativa({ tipo: 'entrada', semaforo: 'rojo', propertyId: 'all' })
  assert.match(g, /consignas de equipaje/)
  assert.doesNotMatch(g, /https?:|\.com/)
  // sin maletas por medio y sin rojo, no se ofrecen
  assert.doesNotMatch(textoNegativa({ tipo: 'salida', semaforo: 'amarillo', propertyId: 'prop_house_sevillana' }), /consigna/)
})

test('tarea de limpieza: fecha de salida / de entrada y texto', () => {
  const s = tareaLimpieza({ tipo: 'salida', hora: '15:00', checkIn: '2026-10-01', checkOut: '2026-10-03', huesped: 'Marta', reservationId: '100' })
  assert.equal(s.fecha, '2026-10-03')
  assert.match(s.texto, /^Salida tardía 15:00 — limpiar después/)
  assert.equal(tareaLimpieza({ tipo: 'entrada', hora: '12:00', checkIn: '2026-10-01', checkOut: '2026-10-03', reservationId: '100' }).fecha, '2026-10-01')
})

test('el prompt prohíbe coste y reseña', () => {
  assert.match(BLOQUE_PROMPT_CAMBIO_HORARIO, /PROHIBIDO mencionar coste/)
  assert.match(BLOQUE_PROMPT_CAMBIO_HORARIO, /reseña/)
})
