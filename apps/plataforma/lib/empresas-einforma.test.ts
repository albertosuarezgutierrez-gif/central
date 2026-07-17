// Tests del mapeo PURO del payload de eInforma. Runner: `node --test`.
// No toca red; solo verifica que mapearFinanciero extrae los campos y normaliza números españoles.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearFinanciero, einformaConfigurado } from './empresas-einforma.ts'

test('payload vacío → todo null, no lanza', () => {
  const d = mapearFinanciero({})
  assert.equal(d.patrimonioNeto, null)
  assert.equal(d.incidenciasPago, null)
  assert.equal(d.cif, null)
})

test('extrae campos financieros y normaliza número español', () => {
  const d = mapearFinanciero({
    identificativo: { cif: 'B12345678', denominacion: 'EJEMPLO SL' },
    actividad: { cnae: '4321' },
    balance: { cifraVentas: '1.250.000,50', patrimonioNeto: '-5.000', ebitda: '-1200', fondoManiobra: '-300', deudaFinanciera: '80000' },
    balanceAnterior: { ebitda: '-800' },
    cuentas: { ultimoDeposito: '2024-11-30' },
    ratios: { deudaEbitda: '7,2' },
    incidencias: { rai: 2, detalle: 'RAI 2 efectos', refinanciaciones: 3 },
  })
  assert.equal(d.cif, 'B12345678')
  assert.equal(d.razonSocial, 'EJEMPLO SL')
  assert.equal(d.cnae, '4321')
  assert.equal(d.facturacion, 1250000.5)
  assert.equal(d.patrimonioNeto, -5000)
  assert.equal(d.ebitdaN, -1200)
  assert.equal(d.ebitdaN1, -800)
  assert.equal(d.fondoManiobra, -300)
  assert.equal(d.ultimoDeposito, '2024-11-30')
  assert.equal(d.deudaEbitda, 7.2)
  assert.equal(d.incidenciasPago, true)
  assert.equal(d.refinanciaciones, 3)
})

test('incidencias booleanas y sin dato', () => {
  assert.equal(mapearFinanciero({ incidencias: { asnef: false } }).incidenciasPago, false)
  assert.equal(mapearFinanciero({ incidenciasPago: true }).incidenciasPago, true)
})

test('einformaConfigurado refleja las envs', () => {
  const prev = { id: process.env.EINFORMA_CLIENT_ID, se: process.env.EINFORMA_CLIENT_SECRET }
  delete process.env.EINFORMA_CLIENT_ID
  delete process.env.EINFORMA_CLIENT_SECRET
  assert.equal(einformaConfigurado(), false)
  process.env.EINFORMA_CLIENT_ID = 'x'
  process.env.EINFORMA_CLIENT_SECRET = 'y'
  assert.equal(einformaConfigurado(), true)
  if (prev.id) process.env.EINFORMA_CLIENT_ID = prev.id; else delete process.env.EINFORMA_CLIENT_ID
  if (prev.se) process.env.EINFORMA_CLIENT_SECRET = prev.se; else delete process.env.EINFORMA_CLIENT_SECRET
})
