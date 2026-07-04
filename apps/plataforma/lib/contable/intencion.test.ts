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

test('"gastado en claude" → concepto genérico (NO total del año)', () => {
  const r = detectarIntencion('¿Cuanto llevo gastado en claude?', HOY)
  assert.ok(r && r.tipo === 'concepto', `esperaba concepto, fue ${r?.tipo}`)
  if (r && r.tipo === 'concepto') {
    assert.equal(r.etiqueta, 'claude')
    assert.deepEqual(r.terminos, ['claude'])
    assert.equal(r.signo, 'gasto')
    assert.equal(r.anio, 2026)
  }
})

test('"gastado en amazon" → concepto genérico amazon', () => {
  const r = detectarIntencion('cuánto he gastado en amazon', HOY)
  assert.ok(r && r.tipo === 'concepto')
  if (r && r.tipo === 'concepto') assert.equal(r.etiqueta, 'amazon')
})

test('"gastado en total este año" → acumulado del año (total NO es proveedor)', () => {
  const r = detectarIntencion('cuánto he gastado en total este año', HOY)
  assert.ok(r && r.tipo === 'movimientos_anio', `esperaba movimientos_anio, fue ${r?.tipo}`)
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

test('"en qué tramo fiscal estamos" → tramo_fiscal (año actual)', () => {
  const r = detectarIntencion('¿En qué tramo fiscal estamos ahora mismo?', HOY)
  assert.ok(r && r.tipo === 'tramo_fiscal')
  if (r && r.tipo === 'tramo_fiscal') assert.equal(r.anio, 2026)
})

test('"mi tipo marginal de IRPF" → tramo_fiscal', () => {
  const r = detectarIntencion('cuál es mi tipo marginal de IRPF', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'tramo_fiscal')
})

test('ORDEN sobre el tramo NO se secuestra ("cámbiame el tramo") → null', () => {
  assert.equal(detectarIntencion('cámbiame el tramo a mano', HOY), null)
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
