// Gastos fijos: ocurrencias de plantilla, fin de mes, deduplicación y derramas que suman exacto.
// Las fechas son fijas a propósito: ninguna función de este módulo lee el reloj (`hoy` se inyecta).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cuotasDerrama, generarOcurrencias, pendientesDeMaterializar } from './gastos-fijos.ts'
import { esFecha, sumarMeses } from './fechas.ts'
import type { PlantillaGasto } from './tipos.ts'

const plantilla = (p: Partial<PlantillaGasto> = {}): PlantillaGasto => ({
  id: 'pl1', titularId: 't1', inmuebleId: 'i1', concepto: 'Cuota comunidad', categoria: 'COMUNIDAD',
  periodicidad: 'mensual', diaMes: 5, inicio: '2026-01-01', fin: null, importe: 6_000, activo: true, ...p,
})

test('mensual: una ocurrencia por mes en el rango, el día pactado', () => {
  const o = generarOcurrencias(plantilla(), '2026-01-01', '2026-04-30')
  assert.deepEqual(o.map((x) => x.fecha), ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'])
  assert.ok(o.every((x) => x.importe === 6_000 && x.inmuebleId === 'i1'))
  assert.deepEqual(o.map((x) => x.clave), ['pl1:2026-01', 'pl1:2026-02', 'pl1:2026-03', 'pl1:2026-04'])
})

test('día 31: cae el último día en los meses cortos y NO desborda a marzo', () => {
  const o = generarOcurrencias(plantilla({ diaMes: 31 }), '2026-01-01', '2026-04-30')
  assert.deepEqual(o.map((x) => x.fecha), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
})

test('bisiesto: el 29 de febrero existe en 2028', () => {
  const o = generarOcurrencias(plantilla({ diaMes: 30, inicio: '2028-02-01' }), '2028-02-01', '2028-02-29')
  assert.deepEqual(o.map((x) => x.fecha), ['2028-02-29'])
})

test('trimestral anclado al mes de inicio', () => {
  const o = generarOcurrencias(plantilla({ periodicidad: 'trimestral', inicio: '2026-02-10', diaMes: 10 }), '2026-01-01', '2026-12-31')
  assert.deepEqual(o.map((x) => x.fecha), ['2026-02-10', '2026-05-10', '2026-08-10', '2026-11-10'])
})

test('anual (IBI): una al año', () => {
  const o = generarOcurrencias(plantilla({ periodicidad: 'anual', inicio: '2024-09-20', diaMes: 20, categoria: 'IMPUESTOS' }), '2024-01-01', '2026-12-31')
  assert.deepEqual(o.map((x) => x.fecha), ['2024-09-20', '2025-09-20', '2026-09-20'])
})

test('respeta inicio y fin de la plantilla: el cargo anterior a la fecha de inicio no existe', () => {
  const o = generarOcurrencias(plantilla({ inicio: '2026-01-20', fin: '2026-03-04', diaMes: 5 }), '2025-01-01', '2026-12-31')
  assert.deepEqual(o.map((x) => x.fecha), ['2026-02-05'])
})

test('plantilla inactiva o rango invertido → nada', () => {
  assert.deepEqual(generarOcurrencias(plantilla({ activo: false }), '2026-01-01', '2026-12-31'), [])
  assert.deepEqual(generarOcurrencias(plantilla(), '2026-12-31', '2026-01-01'), [])
})

test('importe variable: null se mantiene null (se confirma con la factura), nunca 0', () => {
  const o = generarOcurrencias(plantilla({ importe: null, categoria: 'SUMINISTROS' }), '2026-01-01', '2026-01-31')
  assert.equal(o.length, 1)
  assert.equal(o[0].importe, null)
})

test('pendientesDeMaterializar: idempotente frente a lo ya persistido y a duplicados de entrada', () => {
  const o = generarOcurrencias(plantilla(), '2026-01-01', '2026-03-31')
  const p = pendientesDeMaterializar([...o, o[2]], new Set(['pl1:2026-01']))
  assert.deepEqual(p.map((x) => x.clave), ['pl1:2026-02', 'pl1:2026-03'])
})

test('derrama: las cuotas suman EXACTAMENTE el total; el resto va a la primera', () => {
  const c = cuotasDerrama({ id: 'd1', titularId: 't1', inmuebleId: 'i1', concepto: 'Derrama fachada', total: 100_000, cuotas: 3, primera: '2026-01-31' })
  assert.deepEqual(c.map((x) => x.importe), [33_334, 33_333, 33_333])
  assert.equal(c.reduce((s, x) => s + (x.importe ?? 0), 0), 100_000)
  assert.deepEqual(c.map((x) => x.fecha), ['2026-01-31', '2026-02-28', '2026-03-31'])
  assert.equal(new Set(c.map((x) => x.clave)).size, 3)
  assert.ok(c.every((x) => x.categoria === 'COMUNIDAD'))
  assert.equal(c[1].concepto, 'Derrama fachada (2/3)')
})

test('derrama inválida no se inventa reparto', () => {
  const d = { id: 'd', titularId: 't', inmuebleId: 'i', concepto: 'x', total: 1000, cuotas: 0, primera: '2026-01-01' }
  assert.deepEqual(cuotasDerrama(d), [])
  assert.deepEqual(cuotasDerrama({ ...d, cuotas: 2, total: 10.5 }), [])
})

test('fechas: sumarMeses recorta al fin de mes; esFecha rechaza días imposibles', () => {
  assert.equal(sumarMeses('2026-01-31', 1), '2026-02-28')
  assert.equal(sumarMeses('2026-12-15', 2), '2027-02-15')
  assert.equal(sumarMeses('2026-03-31', -1), '2026-02-28')
  assert.equal(esFecha('2026-02-30'), false)
  assert.equal(esFecha('2026-02-28'), true)
  assert.equal(esFecha('28/02/2026'), false)
})
