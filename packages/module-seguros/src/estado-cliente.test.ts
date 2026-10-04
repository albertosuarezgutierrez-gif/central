import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoCliente, type SenalesCliente } from './estado-cliente.ts'
import { normalizarNumeroPoliza } from './duplicados.ts'

const s = (p: Partial<SenalesCliente>): SenalesCliente => ({
  polizasConfirmadasActivas: 0,
  polizasConfirmadasCanceladas: 0,
  polizasHistoricas: 0,
  polizasPendientesCima: 0,
  cotizacionesVivas: 0,
  ...p,
})

test('estado derivado: confirmada por CIMA manda; emitida sin confirmar NO es cliente todavía', () => {
  assert.equal(estadoCliente(s({ polizasConfirmadasActivas: 2 })).estado, 'cliente')
  assert.equal(estadoCliente(s({ polizasPendientesCima: 1 })).estado, 'con_presupuesto')
  assert.equal(estadoCliente(s({ cotizacionesVivas: 1 })).estado, 'con_presupuesto')
  assert.equal(estadoCliente(s({ polizasConfirmadasCanceladas: 3 })).estado, 'ex_cliente')
  assert.equal(estadoCliente(s({ polizasHistoricas: 14 })).estado, 'ex_cliente')
  assert.equal(estadoCliente(s({})).estado, 'lead')
})

test('estado derivado: un «no se pudo contar» de presupuestos no se pinta como «sin presupuesto»', () => {
  const r = estadoCliente(s({ cotizacionesVivas: null }))
  assert.equal(r.estado, 'lead')
  assert.match(r.motivo, /sin poder contar/)
})

test('número de póliza normalizado: espacios, guiones y ceros a la izquierda fuera', () => {
  assert.equal(normalizarNumeroPoliza(' 000123-45 '), '12345')
  assert.equal(normalizarNumeroPoliza('ab.12/3'), 'AB123')
  assert.equal(normalizarNumeroPoliza(''), null)
  assert.equal(normalizarNumeroPoliza(null), null)
})

// Las duplicadas tienen su propio test (`duplicados.test.ts`): desde el 04/10/2026
// la pantalla usa el MISMO criterio que el vigía (`agruparDuplicadas`), que ya no
// filtra por «viva»/cancelada ni cae al nombre de la compañía sin DGS.
