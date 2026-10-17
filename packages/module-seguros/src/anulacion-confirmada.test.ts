import test from 'node:test'
import assert from 'node:assert/strict'
import { textoAnulacionConfirmada, validarAnulacionConfirmada } from './anulacion-confirmada.ts'

const ID = '0b6a3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

test('caso Allianz 031698897: motivo y efecto válidos', () => {
  const v = validarAnulacionConfirmada({ polizaViejaId: ID, motivo: '  Allianz confirma por correo 30/09\nanulación con efecto 01/11/2026 ', fechaEfectoBaja: '2026-11-01' })
  assert.ok(v.ok)
  assert.equal(v.entrada.motivo, 'Allianz confirma por correo 30/09 anulación con efecto 01/11/2026')
  assert.equal(v.entrada.fechaEfectoBaja, '2026-11-01')
})

test('el motivo es OBLIGATORIO: vacío o de relleno no vale', () => {
  assert.equal(validarAnulacionConfirmada({ polizaViejaId: ID, motivo: '' }).ok, false)
  assert.equal(validarAnulacionConfirmada({ polizaViejaId: ID }).ok, false)
  assert.equal(validarAnulacionConfirmada({ polizaViejaId: ID, motivo: '   ok   ' }).ok, false)
  assert.equal(validarAnulacionConfirmada({ polizaViejaId: ID, motivo: 'x'.repeat(501) }).ok, false)
})

test('la fecha de efecto es opcional, pero si viene tiene que ser real', () => {
  const sin = validarAnulacionConfirmada({ polizaViejaId: ID, motivo: 'Allianz confirma por correo', fechaEfectoBaja: '' })
  assert.ok(sin.ok)
  assert.equal(sin.entrada.fechaEfectoBaja, null)
  assert.equal(validarAnulacionConfirmada({ polizaViejaId: ID, motivo: 'Allianz confirma por correo', fechaEfectoBaja: '2026-02-30' }).ok, false)
  assert.equal(validarAnulacionConfirmada({ polizaViejaId: ID, motivo: 'Allianz confirma por correo', fechaEfectoBaja: '01/11/2026' }).ok, false)
})

test('póliza mal identificada → no vale', () => {
  assert.equal(validarAnulacionConfirmada({ polizaViejaId: 'abc', motivo: 'Allianz confirma por correo' }).ok, false)
  assert.equal(validarAnulacionConfirmada(null).ok, false)
})

test('el historial dice qué, de dónde y que el estado NO cambia', () => {
  const t = textoAnulacionConfirmada({ numeroPoliza: '031698897', compania: 'Allianz', motivo: 'correo 30/09', fechaEfectoBaja: '2026-11-01', actor: 'alberto@x' })
  assert.match(t, /Póliza 031698897 \(Allianz\): anulación CONFIRMADA por la compañía con efecto 01\/11\/2026/)
  assert.match(t, /Motivo: correo 30\/09/)
  assert.match(t, /El estado no cambia/)
  assert.match(textoAnulacionConfirmada({ numeroPoliza: null, compania: null, motivo: 'm', fechaEfectoBaja: null, actor: 'a' }), /efecto de la baja sin indicar/)
})
