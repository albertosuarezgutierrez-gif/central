// KPI del panel (7ter) con su fórmula y su estado «sin datos»; importes en formato español; marca AA; paginación «Ver más».
// Cepo visto fallar el 05/11/2026: en lib/kpis.ts devolver `n > 0 ? s : 0` (0 en vez de null) → rojo en «sin datos»; restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularKpis, mismoPeriodoAnioAnterior, periodoAnterior, rangoPeriodo, variacion } from '../lib/kpis.ts'
import { formatearCentimos, parsearImporte } from '../lib/importes.ts'
import { contraste, cssAcento, marcaCabecera, paletaEmpresa } from '../lib/marca.ts'
import { limiteDe } from '../lib/paginas.ts'

const s = (cuenta: string, debe: number, haber: number, n = 1) => ({ cuenta, debe, haber, n })

test('libro vacío: TODOS los KPI son null («sin datos»), ninguno 0', () => {
  const k = calcularKpis([], [])
  for (const [clave, v] of Object.entries(k)) assert.equal(v, null, `${clave} debería ser «sin datos»`)
})

test('fórmulas: ventas 70, gastos 6, resultado 7−6, IVA 477−472, caja 57, cobros 43, pagos 40/41', () => {
  const periodo = [s('705', 0, 100000), s('700', 500, 20000), s('600', 30000, 0), s('628', 5000, 0), s('477', 0, 25200), s('472', 7350, 0), s('759', 0, 1000)]
  const acumulado = [s('572', 150000, 40000), s('570', 2000, 0), s('430', 121000, 60000), s('400', 0, 36300), s('410', 1000, 6050)]
  const k = calcularKpis(periodo, acumulado)
  assert.equal(k.ventas, 119500)
  assert.equal(k.gastos, 35000)
  assert.equal(k.resultado, 120500 - 35000)
  assert.equal(k.ivaEstimado, 25200 - 7350)
  assert.equal(k.caja, 112000)
  assert.equal(k.cobrosPendientes, 61000)
  assert.equal(k.pagosPendientes, 41350)
})

test('tres estados: apuntes que se compensan = 0 (dato); cuentas sin apuntes = null aunque haya otras', () => {
  const k = calcularKpis([s('705', 1000, 1000, 2)], [s('572', 100, 0)])
  assert.equal(k.ventas, 0)
  assert.equal(k.gastos, null)
  assert.equal(k.resultado, 0)
  assert.equal(k.ivaEstimado, null)
  assert.equal(k.cobrosPendientes, null)
  assert.equal(k.caja, 100)
})

test('variación: null si falta cualquiera de los dos lados', () => {
  assert.equal(variacion(100, null), null)
  assert.equal(variacion(null, 100), null)
  assert.equal(variacion(150, 100), 50)
})

test('periodos con reloj inyectado: mes, trimestre, año, anterior y mismo del año pasado (sin fechas fijas del sistema)', () => {
  const hoy = new Date(Date.UTC(2026, 1, 14)) // 14/02/2026
  assert.deepEqual(rangoPeriodo('mes', hoy), { desde: '2026-02-01', hasta: '2026-02-28' })
  assert.deepEqual(rangoPeriodo('trimestre', hoy), { desde: '2026-01-01', hasta: '2026-03-31' })
  assert.deepEqual(periodoAnterior('mes', rangoPeriodo('mes', hoy)), { desde: '2026-01-01', hasta: '2026-01-31' })
  assert.deepEqual(periodoAnterior('trimestre', rangoPeriodo('trimestre', hoy)), { desde: '2025-10-01', hasta: '2025-12-31' })
  assert.deepEqual(mismoPeriodoAnioAnterior('mes', rangoPeriodo('mes', new Date(Date.UTC(2028, 1, 10)))), { desde: '2027-02-01', hasta: '2027-02-28' })
  assert.deepEqual(rangoPeriodo('mes', new Date(Date.UTC(2028, 1, 10))).hasta, '2028-02-29', 'bisiesto')
})

test('importes: «1.234,56» ↔ 123456 sin floats; formato español con miles en 4 cifras y € detrás', () => {
  assert.equal(parsearImporte('1.234,56'), 123456)
  assert.equal(parsearImporte('1234,5'), 123450)
  assert.equal(parsearImporte('0,07'), 7)
  assert.equal(parsearImporte('2.162,49 €'), 216249)
  for (const malo of ['', '-1', '1,234', '12.34', 'abc', '1.23,00', '1,2,3']) assert.equal(parsearImporte(malo), null, malo)
  assert.equal(formatearCentimos(216249), '2.162,49€')
  assert.equal(formatearCentimos(-500), '-5,00€')
})

test('marca: acento de la empresa con AA garantizado (un amarillo se oscurece); sin color → cobalto Grupo ASegura', () => {
  const p = paletaEmpresa('#ffe600')!
  assert.ok(contraste(p.brand, '#ffffff') >= 4.5)
  assert.ok(contraste(p.brand, p.brandSoft) >= 4.5)
  assert.equal(paletaEmpresa('amarillo'), null)
  assert.match(cssAcento(null), /--asegura:#3364ee/)
  assert.equal(marcaCabecera({ razonSocial: 'Talleres Prueba SL', logoUrl: 'http://x' }).logoUrl, null, 'solo https')
  assert.equal(marcaCabecera({ razonSocial: 'Talleres Prueba SL', logoUrl: null }).iniciales, 'TP')
})

test('paginación: múltiplos de 50, mínimo 50, máximo 1000', () => {
  assert.equal(limiteDe(undefined), 50)
  assert.equal(limiteDe('100'), 100)
  assert.equal(limiteDe('120'), 150)
  assert.equal(limiteDe('999999'), 1000)
  assert.equal(limiteDe('-5'), 50)
  assert.equal(limiteDe('abc'), 50)
})
