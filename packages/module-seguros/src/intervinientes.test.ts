import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contactoEfectivo, etiquetaRol, type IntervinienteFicha } from './intervinientes.ts'

const base = (x: Partial<IntervinienteFicha>): IntervinienteFicha => ({
  polizaId: 'p1', rol: 'propietario', nombre: null, nombreIlegible: false,
  telefono: null, email: null, telefonoIlegible: false, emailIlegible: false,
  fichaId: null, esTomador: false, origen: 'cima', ...x,
})

test('el tomador manda: si tiene teléfono, no se mira a nadie más', () => {
  const c = contactoEfectivo({ telefono: '600', email: 'a@b' }, [base({ telefono: '700' })])
  assert.equal(c.telefono, '600')
  assert.equal(c.viaTelefono, 'tomador')
  assert.equal(c.quien, null)
})

test('Esquiansa: la empresa no tiene teléfono, su conductor habitual sí', () => {
  const c = contactoEfectivo({ telefono: null, email: null }, [
    base({ rol: 'conductor_habitual', nombre: 'Juan Manuel Lopez Benjumea', telefono: '600', email: 'jm@x', fichaId: 'f2' }),
  ])
  assert.equal(c.telefono, '600')
  assert.equal(c.viaTelefono, 'interviniente')
  assert.equal(c.quien?.nombre, 'Juan Manuel Lopez Benjumea')
  assert.equal(c.quien?.rol, 'conductor_habitual')
  assert.equal(c.quien?.fichaId, 'f2')
})

test('la persona de contacto va antes que el conductor si las dos tienen teléfono', () => {
  const c = contactoEfectivo({ telefono: null, email: null }, [
    base({ rol: 'conductor_habitual', nombre: 'C', telefono: '1' }),
    base({ rol: 'contacto', nombre: 'K', telefono: '2' }),
  ])
  assert.equal(c.quien?.nombre, 'K')
})

test('un interviniente que ES el tomador no aporta contacto nuevo', () => {
  const c = contactoEfectivo({ telefono: null, email: null }, [base({ telefono: '600', esTomador: true })])
  assert.equal(c.telefono, null)
})

test('🚨 intervinientes sin mirar ≠ sin intervinientes', () => {
  const sinMirar = contactoEfectivo({ telefono: null, email: null }, null)
  assert.equal(sinMirar.intervinientesSinMirar, true)
  const ninguno = contactoEfectivo({ telefono: null, email: null }, [])
  assert.equal(ninguno.intervinientesSinMirar, false)
  assert.equal(ninguno.telefono, null)
})

test('el email puede venir de otra persona que el teléfono', () => {
  const c = contactoEfectivo({ telefono: '600', email: null }, [base({ rol: 'contacto', nombre: 'K', email: 'k@x' })])
  assert.equal(c.viaTelefono, 'tomador')
  assert.equal(c.viaEmail, 'interviniente')
  assert.equal(c.quien?.nombre, 'K')
})

test('etiquetas de rol en castellano, sin guiones bajos', () => {
  assert.equal(etiquetaRol('conductor_habitual'), 'conductor habitual')
  assert.equal(etiquetaRol('lo_que_sea'), 'lo que sea')
})
