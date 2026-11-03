// Runner: `node --test lib/correduria-companias.test.ts`. Puro: sin BD.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularPeriodo, type EntradaBase } from './base-fiscal-devengo.ts'
import { COMPANIAS, clasificarIngresoBanco, companiaDeMovimiento, repartirIngresosBanco } from './correduria-companias.ts'

const CIMA = new Set(['C0468', 'C0058', 'C0072', 'C0109', 'C0613'])
const mov = (mes: string, importe: number, compania: string | null, concepto: string | null = null) => ({ mes, importe, compania, concepto, contraparte: null })

test('mapa: códigos DGS únicos y conocidos de CIMA', () => {
  const cods = COMPANIAS.map(c => c.codigoDgs).filter(Boolean)
  assert.equal(new Set(cods).size, cods.length)
  assert.deepEqual([...cods].sort(), ['C0058', 'C0072', 'C0109', 'C0468', 'C0613'])
})

test('reconoce la compañía por la columna y, si falta, por el concepto real del banco', () => {
  assert.equal(companiaDeMovimiento({ compania: 'Occident' })?.id, 'occident')
  assert.equal(companiaDeMovimiento({ concepto: 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // LIQ.COMISIONES 202603' })?.id, 'mapfre')
  assert.equal(companiaDeMovimiento({ concepto: 'G.65792 liq.00044 generali se' })?.id, 'generali')
  assert.equal(companiaDeMovimiento({ concepto: 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // M1454' })?.id, 'asisa')
  assert.equal(companiaDeMovimiento({ concepto: '-fra-comis-20251231' })?.id, 'caser')
  assert.equal(companiaDeMovimiento({ concepto: 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // COMISIONES AGOSTO     2026' })?.id, 'pelayo')
  assert.equal(companiaDeMovimiento({ concepto: 'Liquidacion de comisiones' })?.id, 'reale')
  assert.equal(companiaDeMovimiento({ concepto: 'Vercel inc. · Pago con tarjeta' }), null)
})

test('compañía CIMA → cima; no CIMA → fuera_cima; desconocido → sin_identificar', () => {
  assert.equal(clasificarIngresoBanco({ compania: 'Generali' }, CIMA).tipo, 'cima')
  assert.equal(clasificarIngresoBanco({ compania: 'Asisa' }, CIMA).tipo, 'fuera_cima')
  assert.equal(clasificarIngresoBanco({ concepto: 'abono raro' }, CIMA).tipo, 'sin_identificar')
  // Si CIMA no trae Generali ese año, su banco sí cuenta.
  assert.equal(clasificarIngresoBanco({ compania: 'Generali' }, new Set()).tipo, 'fuera_cima')
})

test('reparto: CIMA se excluye, no-CIMA se suma, desconocido se avisa y NO se suma', () => {
  const r = repartirIngresosBanco([
    mov('2026-02', 192.25, 'Generali'), mov('2026-03', 100, 'Mapfre'),
    mov('2026-02', 45.15, 'Asisa'), mov('2026-02', 12.66, null, '-fra-comis-20260131'),
    mov('2026-04', 0.31, null, 'Vercel inc. · Pago con tarjeta'),
  ], CIMA)
  assert.equal(r.excluidoCimaTotal, 292.25)
  assert.deepEqual(r.fueraCimaPorMes, { '2026-02': 57.81 })
  assert.deepEqual(r.fueraCimaPorCompania, { Asisa: 45.15, Caser: 12.66 })
  assert.deepEqual(r.sinIdentificar, [{ mes: '2026-04', pagador: 'Vercel inc. · Pago con tarjeta', importe: 0.31 }])
})

const vacio = { ingresosPorMes: {}, gastosPorMes: {} }
const entrada = (correduria: EntradaBase['correduria']): EntradaBase => ({
  anio: 2026, hoy: '2026-10-31', propiedades: [], ingresos: [], gastosPiso: [], gastosCompartidos: [], correduria, pilar: vacio, amortizacion: {}, imputacion: {},
})

test('cepo doble conteo: el banco de una compañía CIMA no entra en el total de la correduría', () => {
  const r = repartirIngresosBanco([mov('2026-02', 192.25, 'Generali'), mov('2026-02', 85, 'Asisa')], CIMA)
  const p = calcularPeriodo(entrada({
    fuente: 'cima', ingresosPorMes: { '2026-02': 226.18 }, retencionPorMes: { '2026-02': 33.93 }, gastosPorMes: {},
    ingresosBancoPorMes: r.fueraCimaPorMes, sinIdentificar: r.sinIdentificar,
  }), '2026-01-01', '2026-10-31')
  // 226,18 (CIMA, incluye Generali) + 85 de Asisa elevado (85/0,85 = 100). Generali del banco (192,25) NO aparece.
  assert.ok(Math.abs((p.correduria.bruto ?? 0) - 326.18) < 0.01, String(p.correduria.bruto))
  assert.ok(Math.abs((p.correduria.desglose?.banco ?? 0) - 100) < 0.01)
  assert.ok(Math.abs((p.correduria.retencion ?? 0) - (33.93 + 15)) < 0.01)
})

test('cepo pagador desconocido: no suma al total y aparece en el desglose', () => {
  const r = repartirIngresosBanco([mov('2026-05', 500, null, 'ingreso misterioso')], CIMA)
  const p = calcularPeriodo(entrada({
    fuente: 'cima', ingresosPorMes: { '2026-05': 100 }, retencionPorMes: { '2026-05': 15 }, gastosPorMes: {},
    ingresosBancoPorMes: r.fueraCimaPorMes, sinIdentificar: r.sinIdentificar,
  }), '2026-01-01', '2026-10-31')
  assert.equal(p.correduria.bruto, 100)
  assert.equal(p.correduria.desglose?.banco, null)
  assert.equal(p.correduria.desglose?.sinIdentificar, 500)
  assert.deepEqual(p.correduria.desglose?.sinIdentificarLista, [{ pagador: 'ingreso misterioso', importe: 500 }])
})
