import test from 'node:test'
import assert from 'node:assert/strict'
import { canalLead, diasHasta, proximoAniversario, puntuarLead, siguientePasoLead, textoPasoLead, ventanaDe } from './lead-competencia.ts'

const hoy = new Date(Date.UTC(2026, 8, 23)) // 23/09/2026

test('el aniversario de una fecha pasada cae este año o el siguiente, nunca antes de hoy', () => {
  assert.equal(proximoAniversario('2023-11-12', hoy), '2026-11-12')
  assert.equal(proximoAniversario('2024-05-22', hoy), '2027-05-22')
  assert.equal(proximoAniversario('2023-09-23', hoy), '2026-09-23')
})

test('un 29 de febrero cae al 28 en año no bisiesto', () => {
  assert.equal(proximoAniversario('2024-02-29', hoy), '2027-02-28')
})

test('sin fecha legible no hay aniversario (no es «vence hoy»)', () => {
  assert.equal(proximoAniversario(null, hoy), null)
  assert.equal(proximoAniversario('basura', hoy), null)
})

test('ventanas y días', () => {
  assert.equal(diasHasta('2026-10-22', hoy), 29)
  assert.equal(ventanaDe(29), 'menos_30')
  assert.equal(ventanaDe(30), '30_60')
  assert.equal(ventanaDe(89), '60_90')
  assert.equal(ventanaDe(90), 'mas_90')
})

test('la prima desconocida no resta; el teléfono pesa más que el correo', () => {
  const base = { tieneTelefono: false, tieneEmail: false, prima: null, respondioAntes: false, ramo: 'vida' }
  assert.equal(puntuarLead(base), 0)
  assert.ok(puntuarLead({ ...base, tieneTelefono: true }) > puntuarLead({ ...base, tieneEmail: true }))
  assert.ok(puntuarLead({ ...base, prima: 100 }) > puntuarLead(base))
  assert.ok(puntuarLead({ ...base, ramo: 'auto' }) > puntuarLead(base))
})

test('secuencia: espera, primer contacto, recordatorio, llamada, aparcar', () => {
  assert.equal(siguientePasoLead(80, 0, null).accion, 'esperar')
  assert.equal(siguientePasoLead(80, 0, null).dentroDeDias, 20)
  assert.equal(siguientePasoLead(50, 0, null).accion, 'primer_contacto')
  assert.deepEqual(siguientePasoLead(40, 1, 3), { accion: 'recordatorio', motivo: 'no ha respondido al primer contacto', dentroDeDias: 4 })
  assert.equal(siguientePasoLead(30, 2, 20).accion, 'llamada')
  assert.equal(siguientePasoLead(30, 2, 20).dentroDeDias, 0)
  assert.equal(siguientePasoLead(10, 3, 1).accion, 'aparcar')
})

test('quien respondió no se aparca: se le llama', () => {
  assert.equal(siguientePasoLead(30, 3, 5, true).accion, 'llamada')
  assert.equal(siguientePasoLead(40, 1, 3, true).accion, 'llamada')
  assert.equal(siguientePasoLead(80, 0, null, true).accion, 'esperar')
})

test('con propuesta enviada no se propone un primer contacto', () => {
  assert.equal(siguientePasoLead(80, 0, null, false, true).accion, 'llamada')
  assert.equal(siguientePasoLead(40, 1, 3, false, true).dentroDeDias, 4)
})

test('LSSI 21.2: correo solo a quien fue cliente; sin teléfono ni relación previa no hay canal permitido', () => {
  assert.equal(canalLead({ fueCliente: true, tieneTelefono: true, tieneEmail: true }), 'telefono_y_correo')
  assert.equal(canalLead({ fueCliente: false, tieneTelefono: true, tieneEmail: true }), 'solo_telefono')
  assert.equal(canalLead({ fueCliente: true, tieneTelefono: false, tieneEmail: true }), 'solo_correo')
  assert.equal(canalLead({ fueCliente: false, tieneTelefono: false, tieneEmail: true }), 'sin_canal_permitido')
})

test('el paso se dice con el canal permitido: primer contacto sin correo es una llamada', () => {
  const primer = siguientePasoLead(50, 0, null)
  assert.equal(textoPasoLead(primer, 'solo_telefono'), 'Primera llamada')
  assert.equal(textoPasoLead(primer, 'telefono_y_correo'), 'Primer correo')
  assert.equal(textoPasoLead(primer, 'sin_canal_permitido'), 'Sin canal permitido')
  assert.equal(textoPasoLead(siguientePasoLead(30, 2, 20), 'solo_correo'), 'Sin teléfono: escribir por correo')
  // A quien no se le puede escribir no se le propone escribirle, en NINGÚN paso.
  for (const paso of [primer, siguientePasoLead(40, 1, 3), siguientePasoLead(30, 2, 20)]) {
    assert.equal(textoPasoLead(paso, 'sin_canal_permitido'), 'Sin canal permitido')
  }
})
