// apps/plataforma/lib/contable/intencion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarIntencion } from './intencion.ts'

const HOY = { anio: 2026, mes: 7 } // julio 2026

test('"gasto total junio" → mes 6 del año actual, gasto', () => {
  const r = detectarIntencion('Dime gasto total junio', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'movimientos_mes')
  if (r!.tipo === 'movimientos_mes') { assert.equal(r!.mes, 6); assert.equal(r!.anio, 2026); assert.equal(r!.signo, 'gasto') }
})

test('mes con año explícito', () => {
  const r = detectarIntencion('cuánto gasté en mayo de 2025', HOY)
  assert.ok(r && r.tipo === 'movimientos_mes')
  if (r && r.tipo === 'movimientos_mes') { assert.equal(r.mes, 5); assert.equal(r.anio, 2025) }
})

test('"mes pasado" desde julio → junio', () => {
  const r = detectarIntencion('gastos del mes pasado', HOY)
  assert.ok(r && r.tipo === 'movimientos_mes')
  if (r && r.tipo === 'movimientos_mes') { assert.equal(r.mes, 6); assert.equal(r.anio, 2026) }
})

test('"mes pasado" desde enero → diciembre del año anterior', () => {
  const r = detectarIntencion('cuánto gasté el mes pasado', { anio: 2026, mes: 1 })
  assert.ok(r && r.tipo === 'movimientos_mes')
  if (r && r.tipo === 'movimientos_mes') { assert.equal(r.mes, 12); assert.equal(r.anio, 2025) }
})

test('"cuánto llevo en luz este año" → concepto luz', () => {
  const r = detectarIntencion('¿Cuánto llevo gastado en luz este año?', HOY)
  assert.ok(r && r.tipo === 'concepto')
  if (r && r.tipo === 'concepto') { assert.equal(r.etiqueta, 'luz'); assert.equal(r.anio, 2026); assert.ok(r.terminos.includes('endesa')) }
})

test('"pisos vs correduría" → por_destino', () => {
  const r = detectarIntencion('¿Cómo van mis gastos de pisos vs correduría?', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'por_destino')
})

test('facturas pendientes', () => {
  const r = detectarIntencion('¿Qué facturas de proveedor tengo pendientes?', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'facturas_pendientes')
})

test('ingresos del año', () => {
  const r = detectarIntencion('cuánto he ingresado este año', HOY)
  assert.ok(r && r.tipo === 'movimientos_anio')
  if (r && r.tipo === 'movimientos_anio') assert.equal(r.signo, 'ingreso')
})

test('ORDEN de acción NO se secuestra (clasifica endesa) → null', () => {
  const r = detectarIntencion('Clasifica el recibo de Endesa como pisos', HOY)
  assert.equal(r, null)
})

test('saludo suelto → null (cae al LLM)', () => {
  assert.equal(detectarIntencion('hola, ¿qué tal?', HOY), null)
})

test('pregunta libre no estructurada → null', () => {
  assert.equal(detectarIntencion('¿me conviene amortizar el sofá?', HOY), null)
})
