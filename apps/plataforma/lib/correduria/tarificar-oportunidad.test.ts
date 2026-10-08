import assert from 'node:assert/strict'
import { test } from 'node:test'
import { destinoTarificar } from './tarificar-oportunidad.ts'

test('con seguimiento abierto: enlace a la pantalla de precio del ramo con ?oportunidad= (nunca cotiza)', () => {
  const d = destinoTarificar({ ramo: 'auto', tomadorId: 'c1', oportunidadId: 'op1', polizaId: 'p1' })
  assert.deepEqual(d, { tipo: 'enlace', href: '/correduria/cliente/c1/auto-nuevo?oportunidad=op1' })
})

test('póliza sin seguimiento: primero se abre (de-poliza) y luego se navega', () => {
  assert.deepEqual(destinoTarificar({ ramo: 'hogar', tomadorId: 'c1', oportunidadId: null, polizaId: 'p1' }), { tipo: 'abrir-y-enlazar', polizaId: 'p1', ramo: 'hogar' })
})

test('ramo sin tarifa o sin ramo: no, con motivo', () => {
  for (const ramo of ['otros', 'comercio', 'responsabilidad_civil', 'comunidades', null]) {
    const d = destinoTarificar({ ramo, tomadorId: 'c1', oportunidadId: 'op1', polizaId: 'p1' })
    assert.equal(d.tipo, 'no', String(ramo))
    if (d.tipo === 'no') assert.ok(d.motivo.length > 0)
  }
})

test('sin oportunidad ni póliza no hay nada que abrir', () => {
  assert.equal(destinoTarificar({ ramo: 'auto', tomadorId: 'c1', oportunidadId: null, polizaId: null }).tipo, 'no')
})
