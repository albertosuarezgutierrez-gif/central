import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajesDebidos, claveHito, hitosBloqueantes, type ReservaMin } from './decidir.ts'

const R: ReservaMin = {
  bookingId: '1', propertyId: 'prop_duplex_center',
  checkIn: '2026-09-13', checkOut: '2026-09-20', noches: 7, createdAt: '2026-08-20',
}
const tipos = (out: { tipo: string }[]) => out.map(o => o.tipo).sort()

test('a 10 días solo se debe la confirmación', () => {
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-03', '12:00', new Set())), ['confirmacion'])
})

test('la ventana de acceso abre a 7 días y a partir de las 09:00', () => {
  const ya = new Set([claveHito('confirmacion', R.checkIn)])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-06', '08:30', ya)), [])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-06', '09:30', ya)), ['acceso'])
})

test('víspera a las 08:00 aún no; a las 09:30 sí, y no repite lo ya hecho', () => {
  const ya = new Set([claveHito('confirmacion', R.checkIn), claveHito('acceso', R.checkIn)])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-12', '08:00', ya)), [])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-12', '09:30', ya)), ['vispera_llegada'])
})

test('día de llegada con víspera ya enviada → bienvenida desde las 08:00', () => {
  const ya = new Set([
    claveHito('confirmacion', R.checkIn), claveHito('acceso', R.checkIn),
    claveHito('vispera_llegada', R.checkIn),
  ])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-13', '08:30', ya)), ['bienvenida'])
})

test('última hora (reserva hecha hoy, llega hoy): confirmación + víspera-con-códigos marcada HOY, nada más', () => {
  const r: ReservaMin = { ...R, checkIn: '2026-09-13', checkOut: '2026-09-15', createdAt: '2026-09-13' }
  const out = mensajesDebidos(r, '2026-09-13', '13:00', new Set())
  assert.deepEqual(tipos(out), ['confirmacion', 'vispera_llegada'])
  const vis = out.find(o => o.tipo === 'vispera_llegada')!
  assert.equal(vis.llegadaHoy, true)
})

test('primer arranque con el huésped YA dentro: ni confirmación tardía ni bienvenida tardía', () => {
  // Reserva vieja, hoy es mitad de estancia y el registro está vacío (estreno del orquestador).
  const out = mensajesDebidos(R, '2026-09-16', '12:00', new Set())
  assert.deepEqual(tipos(out), [])
})

test('estancia solo el día siguiente exacto, con 3+ noches y desde las 10:30', () => {
  const ya = new Set([claveHito('bienvenida', R.checkIn)])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-14', '10:00', ya)), [])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-14', '11:00', ya)), ['estancia'])
  const corta: ReservaMin = { ...R, checkIn: '2026-09-13', checkOut: '2026-09-15', noches: 2 }
  assert.deepEqual(tipos(mensajesDebidos(corta, '2026-09-14', '11:00', new Set())), [])
})

test('víspera de salida a las 17:00; post-salida desde las 12:00 del día de salida (o al día siguiente)', () => {
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-19', '16:00', new Set())), [])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-19', '17:30', new Set())), ['vispera_salida'])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-20', '11:00', new Set())), [])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-20', '12:30', new Set())), ['post_salida'])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-21', '08:00', new Set())), ['post_salida'])
  assert.deepEqual(tipos(mensajesDebidos(R, '2026-09-22', '08:00', new Set())), [])
})

test('estancia de 1 noche: sin víspera de salida (colapsaría con la llegada)', () => {
  const r: ReservaMin = { ...R, checkIn: '2026-09-13', checkOut: '2026-09-14', noches: 1 }
  const ya = new Set([claveHito('confirmacion', r.checkIn), claveHito('vispera_llegada', r.checkIn)])
  assert.deepEqual(tipos(mensajesDebidos(r, '2026-09-13', '18:00', ya)), ['bienvenida'])
})

test('una modificación que mueve la llegada crea claves nuevas (los hitos se vuelven a deber)', () => {
  const ya = new Set([claveHito('acceso', '2026-09-13'), claveHito('confirmacion', '2026-09-13')])
  const movida: ReservaMin = { ...R, checkIn: '2026-09-15', checkOut: '2026-09-22' }
  assert.deepEqual(tipos(mensajesDebidos(movida, '2026-09-10', '10:00', ya)), ['acceso', 'confirmacion'])
})

// ── hitosBloqueantes ────────────────────────────────────────────────────────
test('sombra NO bloquea con el piso ya activo (se re-emite de verdad)', () => {
  const filas = [{ tipo: 'vispera_llegada', fechaObjetivo: '2026-09-05', estado: 'sombra' }]
  assert.equal(hitosBloqueantes(filas, true).bloqueantes.size, 0)
})

test('sombra SÍ bloquea con el piso inactivo (si no, Telegram repetiría el borrador)', () => {
  const filas = [{ tipo: 'vispera_llegada', fechaObjetivo: '2026-09-05', estado: 'sombra' }]
  assert.ok(hitosBloqueantes(filas, false).bloqueantes.has(claveHito('vispera_llegada', '2026-09-05')))
})

test('enviado/pendiente/fallo bloquean siempre', () => {
  for (const estado of ['enviado', 'pendiente', 'fallo']) {
    const filas = [{ tipo: 'bienvenida', fechaObjetivo: '2026-09-05', estado }]
    assert.ok(hitosBloqueantes(filas, true).bloqueantes.has(claveHito('bienvenida', '2026-09-05')), estado)
  }
})

// Caso real 05/09/2026 (reserva 154265696, Luxury Busto): la víspera con los CÓDIGOS quedó en
// sombra 12 h antes de activarse el piso. Con el piso ya activo, el día de llegada tiene que salir.
test('la víspera en sombra sale el día de llegada una vez activo el piso', () => {
  const r = { bookingId: '154265696', propertyId: 'prop_luxury_busto', checkIn: '2026-09-05', checkOut: '2026-09-08', noches: 3 }
  const filas = [{ tipo: 'vispera_llegada', fechaObjetivo: '2026-09-05', estado: 'sombra' }]
  const debidos = mensajesDebidos(r, '2026-09-05', '09:37', hitosBloqueantes(filas, true).bloqueantes)
  const v = debidos.find(d => d.tipo === 'vispera_llegada')
  assert.ok(v, 'debe re-emitirse la víspera con los códigos')
  assert.equal(v!.llegadaHoy, true)
})

// La otra cara del rescate: si la víspera salió HOY, la bienvenida NO sale unas horas después.
// Su clave es la misma en los dos casos (se ancla a checkIn), así que sin `emitidosHoy` el mismo
// huésped recibía dos mensajes nuestros el día de su llegada. Caso real: reserva 154265696.
test('la bienvenida NO sale el día que la víspera se rescató', () => {
  const r = { bookingId: '154265696', propertyId: 'prop_luxury_busto', checkIn: '2026-09-05', checkOut: '2026-09-08', noches: 3 }
  const filas = [{ tipo: 'vispera_llegada', fechaObjetivo: '2026-09-05', estado: 'enviado', emitidoHoy: true }]
  const { bloqueantes, emitidosHoy } = hitosBloqueantes(filas, true)
  const debidos = mensajesDebidos(r, '2026-09-05', '10:07', bloqueantes, emitidosHoy)
  assert.equal(debidos.find(d => d.tipo === 'bienvenida'), undefined)
  // Y tampoco se reintenta la víspera: ya está registrada como enviada.
  assert.equal(debidos.find(d => d.tipo === 'vispera_llegada'), undefined)
})

test('la bienvenida SÍ sale si la víspera salió AYER (camino normal)', () => {
  const r = { bookingId: '1', propertyId: 'prop_luxury_busto', checkIn: '2026-09-05', checkOut: '2026-09-08', noches: 3 }
  const filas = [{ tipo: 'vispera_llegada', fechaObjetivo: '2026-09-05', estado: 'enviado', emitidoHoy: false }]
  const { bloqueantes, emitidosHoy } = hitosBloqueantes(filas, true)
  const debidos = mensajesDebidos(r, '2026-09-05', '10:07', bloqueantes, emitidosHoy)
  assert.ok(debidos.find(d => d.tipo === 'bienvenida'))
})
