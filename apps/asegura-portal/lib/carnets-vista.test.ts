// La parte pura de la tarjeta de «Mis carnés»: qué fechas se dicen, qué se precarga al pulsar «Cambiar»
// y cómo se lee el interruptor del aviso. Cada brazo se vio en rojo antes de dejarlo en verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { faltaNacimiento, fechaPrecargada, leerInterruptorCarnet, modoInicialCambio, textoFechasCarnet } from './carnets-vista.ts'

test('«Expedido el … · Caduca el …» en formato español; cada mitad solo si se conoce', () => {
  assert.equal(textoFechasCarnet({ fechaExpedicion: '2020-01-05', fechaCaducidad: '2030-01-05' }), 'Expedido el 05/01/2020 · Caduca el 05/01/2030')
  assert.equal(textoFechasCarnet({ fechaCaducidad: '2030-01-05' }), 'Caduca el 05/01/2030')
  assert.equal(textoFechasCarnet({ fechaExpedicion: '2020-01-05', fechaCaducidad: null }), 'Expedido el 05/01/2020')
  assert.equal(textoFechasCarnet({ fechaExpedicion: null, fechaCaducidad: null }), null)
})

test('🪤 sin caducidad = falta el nacimiento; con caducidad, no', () => {
  assert.equal(faltaNacimiento({ fechaCaducidad: null }), true)
  assert.equal(faltaNacimiento({ fechaCaducidad: '2030-01-05' }), false)
})

test('«Cambiar» abre PRECARGADO con la fecha del modo elegido; sin esa fecha, vacío (nunca la del otro modo)', () => {
  const c = { fechaExpedicion: '2020-01-05', fechaCaducidad: '2030-01-05' }
  assert.equal(fechaPrecargada(c, 'caducidad'), '2030-01-05')
  assert.equal(fechaPrecargada(c, 'expedicion'), '2020-01-05')
  assert.equal(fechaPrecargada({ fechaCaducidad: '2030-01-05' }, 'expedicion'), '')
  assert.equal(fechaPrecargada({ fechaCaducidad: null, fechaExpedicion: '2020-01-05' }, 'caducidad'), '')
  assert.equal(fechaPrecargada(c, 'caducidad').length, 10)
  assert.equal(fechaPrecargada(null, 'caducidad'), '', 'alta: vacío')
  assert.equal(fechaPrecargada({ fechaCaducidad: 'ayer' }, 'caducidad'), '', 'una fecha rara no se mete en el <input type=date>')
})

test('el modo inicial es caducidad (anverso) salvo que no conste y sí la expedición', () => {
  assert.equal(modoInicialCambio({ fechaCaducidad: '2030-01-05', fechaExpedicion: '2020-01-05' }), 'caducidad')
  assert.equal(modoInicialCambio({ fechaCaducidad: null, fechaExpedicion: '2020-01-05' }), 'expedicion')
  assert.equal(modoInicialCambio({ fechaCaducidad: null }), 'caducidad')
})

test('🚨 el interruptor: solo un booleano es una lectura; cualquier otra cosa es «no se sabe» (null), nunca encendido', () => {
  assert.equal(leerInterruptorCarnet({ preferencias: { vencimiento_carnet: false } }), false)
  assert.equal(leerInterruptorCarnet({ preferencias: { vencimiento_carnet: true } }), true)
  for (const raro of [null, {}, { preferencias: {} }, { preferencias: { vencimiento_carnet: 'no' } }, { preferencias: null }, 'x']) {
    assert.equal(leerInterruptorCarnet(raro), null)
  }
})
