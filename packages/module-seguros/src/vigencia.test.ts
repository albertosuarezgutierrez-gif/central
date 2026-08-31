import test from 'node:test'
import assert from 'node:assert/strict'
import { vigenciaPoliza, esEstadoVigente, POLIZA_ESTADOS_VIGENTES } from './vigencia.ts'

const HOY = new Date('2026-08-31T10:00:00Z')

test('la lista de estados vigentes es exactamente la del CRM de origen', () => {
  assert.deepEqual(
    [...POLIZA_ESTADOS_VIGENTES],
    ['activa', 'en_renovacion', 'en_vigor', 'recibo_devuelto', 'cambio_clave'],
  )
})

test('«activa» con vencimiento futuro es vigente', () => {
  assert.equal(vigenciaPoliza({ estado: 'activa', fechaVencimiento: new Date('2027-01-01') }, HOY), 'vigente')
})

test('«activa» con vencimiento PASADO no es vigente — la etiqueta no manda, la fecha sí', () => {
  assert.equal(vigenciaPoliza({ estado: 'activa', fechaVencimiento: new Date('2019-05-01') }, HOY), 'no_vigente')
})

test('vence HOY sigue vigente hoy', () => {
  assert.equal(vigenciaPoliza({ estado: 'en_vigor', fechaVencimiento: new Date('2026-08-31') }, HOY), 'vigente')
})

test('estado vigente SIN fecha es «pendiente» — nunca se colapsa a vigente ni a no_vigente', () => {
  assert.equal(vigenciaPoliza({ estado: 'activa', fechaVencimiento: null }, HOY), 'pendiente')
})

test('estado no vigente es no_vigente aunque la fecha sea futura', () => {
  for (const estado of ['vencida', 'cancelada', 'fin_riesgo', 'competencia', 'anula_al_vencimiento']) {
    assert.equal(vigenciaPoliza({ estado, fechaVencimiento: new Date('2099-01-01') }, HOY), 'no_vigente', estado)
  }
})

test('estado no vigente sin fecha tampoco es pendiente: ya se sabe que no está en vigor', () => {
  assert.equal(vigenciaPoliza({ estado: 'vencida', fechaVencimiento: null }, HOY), 'no_vigente')
})

test('un estado desconocido no cuela como vigente', () => {
  assert.equal(esEstadoVigente('emitida'), false)
  assert.equal(vigenciaPoliza({ estado: 'lo_que_sea', fechaVencimiento: new Date('2099-01-01') }, HOY), 'no_vigente')
})
