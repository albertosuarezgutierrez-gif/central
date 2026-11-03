import { test } from 'node:test'
import assert from 'node:assert/strict'

import { armarTitulares, desdeRecibos, leerDesdeMes, type EntradaConversion } from './patrimonio-conversion-reglas.ts'

const AHORA = new Date('2026-10-27T10:00:00.000Z')
const T = { titularId: 't1', clienteId: 'c1', nombre: ' Ana Ruiz ', activoDesde: new Date('2026-09-01T08:00:00.000Z') }
const base = (): EntradaConversion => ({
  titulares: [T],
  inmuebles: { ok: true, valor: { conUnidades: true, filas: [{ titularId: 't1', sueltos: 2, unidades: 5 }] } },
  facturas: [{ titularId: 't1', total: 7, mes: 3 }],
  volcados: { ok: true, valor: [{ titularId: 't1', total: 2, mes: 1 }] },
  polizas: { ok: true, valor: [
    { clienteId: 'c1', importRef: null, eiacXmlHash: 'h', estado: 'activa', sustituidaAt: null, mergedIntoPolizaId: null, creadaEn: new Date('2026-10-01T00:00:00Z') },
    { clienteId: 'otro', importRef: null, eiacXmlHash: null, estado: 'activa', sustituidaAt: null, mergedIntoPolizaId: null, creadaEn: null },
  ] },
  recibos: { ok: true, valor: [
    { clienteId: 'c1', fecha: new Date('2026-06-01T00:00:00Z'), comisionBruta: '12,50' },
    { clienteId: 'c1', fecha: new Date('2024-01-01T00:00:00Z'), comisionBruta: '99' },
    { clienteId: 'c1', fecha: null, comisionBruta: null },
    { clienteId: 'otro', fecha: new Date('2026-06-01T00:00:00Z'), comisionBruta: '1' },
  ] },
})

test('caso completo: cifras, pólizas y recibos solo del titular', () => {
  const [r] = armarTitulares(base(), AHORA)
  assert.equal(r.cliente, 'Ana Ruiz')
  assert.equal(r.activoDesde, '2026-09-01T08:00:00.000Z')
  assert.equal(r.inmuebles, 2)
  assert.equal(r.unidades, 5)
  assert.deepEqual(r.lecturas, { facturasTotal: 7, facturasMes: 3, volcadosTotal: 2, volcadosMes: 1 })
  assert.equal(r.polizas?.length, 1)
  assert.equal(r.polizas?.[0].eiacXmlHash, 'h')
  assert.equal(r.polizas?.[0].creadaEn, '2026-10-01T00:00:00.000Z')
  // fuera de ventana (2024) fuera; sin fecha se queda (plataforma la cuenta como ilegible)
  assert.deepEqual(r.recibos, [{ fecha: '2026-06-01T00:00:00.000Z', comisionBruta: '12,50' }, { fecha: null, comisionBruta: null }])
})

test('sin filas en lecturas buenas = 0 (revisado); lectura fallida = null, nunca 0', () => {
  const e: EntradaConversion = { ...base(), inmuebles: { ok: true, valor: { conUnidades: true, filas: [] } }, facturas: [], volcados: { ok: true, valor: [] }, polizas: { ok: true, valor: [] }, recibos: { ok: true, valor: [] } }
  const [a] = armarTitulares(e, AHORA)
  assert.equal(a.inmuebles, 0); assert.equal(a.unidades, 0)
  assert.deepEqual(a.lecturas, { facturasTotal: 0, facturasMes: 0, volcadosTotal: 0, volcadosMes: 0 })
  assert.deepEqual(a.polizas, []); assert.deepEqual(a.recibos, [])

  const [b] = armarTitulares({ ...base(), inmuebles: { ok: false }, volcados: { ok: false }, polizas: { ok: false }, recibos: { ok: false } }, AHORA)
  assert.equal(b.inmuebles, null); assert.equal(b.unidades, null)
  assert.equal(b.lecturas.volcadosTotal, null); assert.equal(b.lecturas.volcadosMes, null)
  assert.equal(b.lecturas.facturasTotal, 7)
  assert.equal(b.polizas, null); assert.equal(b.recibos, null)
})

test('sin columna inmueble_padre_id: inmuebles = todas las filas, unidades null (aunque no haya fila)', () => {
  const e: EntradaConversion = { ...base(), inmuebles: { ok: true, valor: { conUnidades: false, filas: [{ titularId: 't1', sueltos: 4, unidades: 0 }] } } }
  const [r] = armarTitulares(e, AHORA)
  assert.equal(r.inmuebles, 4)
  assert.equal(r.unidades, null)
  const [v] = armarTitulares({ ...e, inmuebles: { ok: true, valor: { conUnidades: false, filas: [] } } }, AHORA)
  assert.equal(v.inmuebles, 0); assert.equal(v.unidades, null)
})

test('nombre vacío no rompe el contrato; no sale PII (solo las claves del contrato)', () => {
  const [r] = armarTitulares({ ...base(), titulares: [{ ...T, nombre: null }] }, AHORA)
  assert.equal(r.cliente, 'Cliente sin nombre')
  assert.deepEqual(Object.keys(r).sort(), ['activoDesde', 'cliente', 'clienteId', 'inmuebles', 'lecturas', 'polizas', 'recibos', 'titularId', 'unidades'])
  assert.deepEqual(Object.keys(r.polizas![0]).sort(), ['creadaEn', 'eiacXmlHash', 'estado', 'importRef', 'mergedIntoPolizaId', 'sustituidaAt'])
})

test('leerDesdeMes e inicio de ventana', () => {
  assert.equal(leerDesdeMes(null), null)
  assert.equal(leerDesdeMes('basura'), null)
  assert.equal(leerDesdeMes('2026-09-30T22:00:00.000Z')?.toISOString(), '2026-09-30T22:00:00.000Z')
  assert.equal(desdeRecibos(AHORA).toISOString(), '2025-10-26T10:00:00.000Z')
})
