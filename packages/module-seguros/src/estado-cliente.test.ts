import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoCliente, type SenalesCliente } from './estado-cliente.ts'
import { normalizarNumeroPoliza, polizasDuplicadas, type PolizaParaDuplicados } from './duplicados.ts'

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

test('duplicadas: solo vivas no canceladas, por número + código de compañía; marca las que mezclan emitida y CIMA', () => {
  const p = (x: Partial<PolizaParaDuplicados> & { id: string }): PolizaParaDuplicados => ({
    clienteId: 'c', numeroPoliza: '123', codigoEntidadDgs: 'C0058', aseguradora: 'Mapfre', viva: true, confirmadaCima: true, estado: 'activa', ...x,
  })
  const g = polizasDuplicadas([
    p({ id: 'a' }),
    p({ id: 'b', confirmadaCima: false, codigoEntidadDgs: null, aseguradora: 'c0058' }),
    p({ id: 'h', viva: false }), // histórica del volcado: no cuenta
    p({ id: 'k', estado: 'cancelada' }),
    p({ id: 'x', numeroPoliza: '999' }),
    p({ id: 'y', numeroPoliza: '0999', codigoEntidadDgs: 'C0109' }), // otra compañía: no es duplicado
  ])
  assert.equal(g.length, 1)
  assert.equal(g[0].numero, '123')
  assert.deepEqual(g[0].polizas.map((x) => x.id), ['a', 'b'])
  assert.equal(g[0].emitidaYCima, true)
})
