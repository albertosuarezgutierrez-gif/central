// Cepos del carné de moto único (19/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { carnetMotoMasAntiguo } from './carnet-moto.ts'
import { sexoDeSaludo } from './cliente-edicion.ts'

test('carnetMotoMasAntiguo: el MÁS ANTIGUO de A/A1/A2 (no el de mayor rango), con su tipo', () => {
  const r = carnetMotoMasAntiguo([{ tipo: 'B', fechaExpedicion: '1999-01-01' }, { tipo: 'A', fechaExpedicion: '2010-06-30' }, { tipo: 'a2', fechaExpedicion: '2005-05-05' }])
  assert.deepEqual(r, { tipo: 'A2', fecha: '2005-05-05' })
})

test('carnetMotoMasAntiguo: sin fecha ISO válida, AM y B no cuentan; nada → null', () => {
  assert.equal(carnetMotoMasAntiguo([{ tipo: 'AM', fechaExpedicion: '2001-01-01' }, { tipo: 'B', fechaExpedicion: '2001-01-01' }]), null)
  assert.equal(carnetMotoMasAntiguo([{ tipo: 'A', fechaExpedicion: '2001-02-30' }, { tipo: 'A1', fechaExpedicion: '03/04/2002' }, { tipo: 'A2', fechaExpedicion: null }]), null)
  assert.deepEqual(carnetMotoMasAntiguo([{ tipo: 'A', fechaExpedicion: 'basura' }, { tipo: 'A1', fechaExpedicion: '2008-08-08' }]), { tipo: 'A1', fecha: '2008-08-08' })
  assert.equal(carnetMotoMasAntiguo(null), null)
})

test('sexoDeSaludo: solo 1 (hombre) y 2 (mujer); cualquier otro tratamiento no se deduce', () => {
  assert.equal(sexoDeSaludo('1'), 'hombre')
  assert.equal(sexoDeSaludo(' 2 '), 'mujer')
  for (const v of ['3', '', null, undefined, 'Sr.']) assert.equal(sexoDeSaludo(v), null, String(v))
})
