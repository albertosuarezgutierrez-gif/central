import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLAZO_SAC_MESES,
  plazoQueja,
  estadoPlazoQueja,
  transicionQuejaValida,
  validarAltaQueja,
  validarCierreQueja,
  informeSac,
} from './queja.ts'
import { CANALES_RECLAMACION } from './mediador.ts'

test('🪤 el plazo es un mes NATURAL: 31/01 vence el último día de febrero, no el 02/03', () => {
  assert.equal(plazoQueja('2026-01-31'), '2026-02-28')
  assert.equal(plazoQueja('2028-01-31'), '2028-02-29')
  assert.equal(plazoQueja('2026-09-24'), '2026-10-24')
  assert.equal(plazoQueja('2026-12-15'), '2027-01-15')
  assert.equal(plazoQueja('2026-02-30'), null)
})

test('🪤 el plazo del código es el que se PUBLICA al cliente en el portal y la web', () => {
  const sac = CANALES_RECLAMACION.find((c) => c.id === 'sac')
  assert.ok(sac)
  assert.equal(PLAZO_SAC_MESES, 1)
  assert.match(sac.detalle, /un mes/)
})

test('🪤 el reloj: el día del límite aún se está a tiempo; el siguiente, vencida', () => {
  const q = { estado: 'recibida' as const, plazoEl: '2026-10-24' }
  assert.equal(estadoPlazoQueja(q, '2026-10-01'), 'en_plazo')
  assert.equal(estadoPlazoQueja(q, '2026-10-17'), 'urgente')
  assert.equal(estadoPlazoQueja(q, '2026-10-24'), 'urgente')
  assert.equal(estadoPlazoQueja(q, '2026-10-25'), 'vencida')
  assert.equal(estadoPlazoQueja({ estado: 'resuelta_parcial', plazoEl: '2026-10-24' }, '2026-12-01'), 'cerrada')
  assert.equal(estadoPlazoQueja({ estado: 'en_tramite', plazoEl: 'x' }, '2026-10-01'), null)
})

test('una cerrada no se reabre y nada vuelve a «recibida»', () => {
  assert.equal(transicionQuejaValida('recibida', 'en_tramite'), true)
  assert.equal(transicionQuejaValida('en_tramite', 'resuelta_favorable'), true)
  assert.equal(transicionQuejaValida('recibida', 'desistida'), true)
  assert.equal(transicionQuejaValida('resuelta_favorable', 'en_tramite'), false)
  assert.equal(transicionQuejaValida('en_tramite', 'recibida'), false)
  assert.equal(transicionQuejaValida('en_tramite', 'en_tramite'), false)
})

test('alta: sin reclamante, sin detalle, fecha futura o valores fuera de lista no pasan', () => {
  const ok = { reclamante: 'Ana', canal: 'correo', motivo: 'siniestro', recibidaEl: '2026-09-24', detalle: 'No me pagan el parte' }
  assert.deepEqual(validarAltaQueja(ok, '2026-09-24'), [])
  assert.equal(validarAltaQueja({ ...ok, reclamante: ' ' }, '2026-09-24').length, 1)
  assert.equal(validarAltaQueja({ ...ok, detalle: '' }, '2026-09-24').length, 1)
  assert.equal(validarAltaQueja({ ...ok, recibidaEl: '2026-09-25' }, '2026-09-24').length, 1)
  assert.equal(validarAltaQueja({ ...ok, canal: 'fax' }, '2026-09-24').length, 1)
  assert.equal(validarAltaQueja({ ...ok, motivo: 'x' }, '2026-09-24').length, 1)
})

test('🪤 resolverla exige la respuesta que se dio; desistir no', () => {
  assert.ok(validarCierreQueja('resuelta_desfavorable', ''))
  assert.ok(validarCierreQueja('resuelta_favorable', null))
  assert.equal(validarCierreQueja('resuelta_favorable', 'Se reclamó a la compañía y pagó'), null)
  assert.equal(validarCierreQueja('desistida', null), null)
  assert.equal(validarCierreQueja('en_tramite', null), null)
})

test('informe anual: cuenta por año de ENTRADA y separa en plazo / fuera de plazo', () => {
  const q = [
    { estado: 'resuelta_favorable' as const, motivo: 'siniestro' as const, recibidaEl: '2026-02-01', plazoEl: '2026-03-01', resueltaEl: '2026-02-20' },
    { estado: 'resuelta_desfavorable' as const, motivo: 'cobro_recibo' as const, recibidaEl: '2026-05-01', plazoEl: '2026-06-01', resueltaEl: '2026-06-10' },
    { estado: 'en_tramite' as const, motivo: 'siniestro' as const, recibidaEl: '2026-12-20', plazoEl: '2027-01-20', resueltaEl: null },
    { estado: 'resuelta_parcial' as const, motivo: 'otro' as const, recibidaEl: '2025-12-20', plazoEl: '2026-01-20', resueltaEl: '2026-01-10' },
  ]
  const i = informeSac(q, 2026)
  assert.equal(i.total, 3)
  assert.equal(i.abiertas, 1)
  assert.equal(i.porMotivo.siniestro, 2)
  assert.equal(i.cerradasEnPlazo, 1)
  assert.equal(i.cerradasFueraDePlazo, 1)
  assert.equal(informeSac(q, 2025).total, 1)
})
