import { test } from 'node:test'
import assert from 'node:assert'
import { decidirSalida, momentoSalida, restarDias, textoAvisoIncompleta, VENTANA_DIAS, type EntradaDecision } from './salida-decision.ts'

// Fechas RELATIVAS a hoy (nunca fijas contra el reloj real).
const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
const sumar = (n: number) => restarDias(hoy, -n)

const BASE: EntradaDecision = { hoy, hasta: hoy, estadoSolicitud: 'pendiente', factura: null, faltan: [], avisoYa: false }

test('restarDias cruza meses y años', () => {
  assert.equal(restarDias('2027-01-02', 3), '2026-12-30')
  assert.equal(restarDias('2027-03-01', 1), '2027-02-28')
  assert.equal(restarDias('2027-03-28', -1), '2027-03-29') // cambio de hora: no afecta
})

test('momentoSalida: hoy y pasada dentro de la ventana tocan; futura y vieja no', () => {
  assert.equal(momentoSalida(hoy, hoy), 'toca')
  assert.equal(momentoSalida(sumar(-1), hoy), 'toca')
  assert.equal(momentoSalida(sumar(-VENTANA_DIAS), hoy), 'toca')
  assert.equal(momentoSalida(sumar(-VENTANA_DIAS - 1), hoy), 'demasiado_vieja')
  assert.equal(momentoSalida(sumar(1), hoy), 'antes')
  assert.equal(momentoSalida(null, hoy), 'sin_fecha')
})

test('completa y sin factura el día de salida → emitir', () => {
  assert.deepEqual(decidirSalida(BASE), { accion: 'emitir' })
  assert.deepEqual(decidirSalida({ ...BASE, factura: { estado: 'borrador', envioIntentos: 0 } }), { accion: 'emitir' })
})

test('antes de la salida no se emite ni se avisa', () => {
  assert.equal(decidirSalida({ ...BASE, hasta: sumar(2) }).accion, 'nada')
  assert.equal(decidirSalida({ ...BASE, hasta: sumar(2), faltan: ['email'] }).accion, 'nada')
})

test('idempotencia: ya emitida/enviada → nada; emitida sin ningún intento de envío → enviar', () => {
  assert.equal(decidirSalida({ ...BASE, factura: { estado: 'enviada', envioIntentos: 1 } }).accion, 'nada')
  assert.equal(decidirSalida({ ...BASE, factura: { estado: 'emitida', envioIntentos: 1 } }).accion, 'nada') // falló o dudoso: decide Alberto
  assert.equal(decidirSalida({ ...BASE, factura: { estado: 'emitida', envioIntentos: 0 } }).accion, 'enviar')
  assert.equal(decidirSalida({ ...BASE, factura: { estado: 'rectificada', envioIntentos: 1 } }).accion, 'nada')
})

test('incompleta → UN aviso; ya avisada → nada', () => {
  assert.deepEqual(decidirSalida({ ...BASE, faltan: ['email al que enviar la factura'] }), { accion: 'avisar', motivos: ['email al que enviar la factura'] })
  assert.equal(decidirSalida({ ...BASE, faltan: ['x'], avisoYa: true }).accion, 'nada')
  // Avisada pero ya completa (Alberto la completó) → se emite en el siguiente pase.
  assert.equal(decidirSalida({ ...BASE, avisoYa: true }).accion, 'emitir')
})

test('cancelada o fuera de ventana → nada', () => {
  assert.equal(decidirSalida({ ...BASE, estadoSolicitud: 'cancelada' }).accion, 'nada')
  assert.equal(decidirSalida({ ...BASE, hasta: sumar(-40) }).accion, 'nada')
})

test('texto del aviso: dice qué falta y que no se repite', () => {
  const t = textoAvisoIncompleta({ piso: 'House Sevillana', reservationId: '1', hasta: '2026-10-23', motivos: ['NIF/CIF/VAT'] })
  assert.match(t, /• NIF\/CIF\/VAT/)
  assert.match(t, /23\/10\/2026/)
  assert.match(t, /no se repite/)
})
