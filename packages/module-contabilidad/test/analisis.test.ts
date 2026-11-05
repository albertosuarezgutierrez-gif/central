// KPI (fórmula + «sin datos»), comparativas, series, gastos por categoría, previsión, antigüedad, rentabilidad por dimensión, medios.
// Todo con reloj inyectado: ninguna fecha depende del día en que corra el test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularKpis, comparar, variacionPct, tarjetasKpi, kpisDeAsientos, sumasDeAsientos, rangosComparativa, cubosHasta,
  gastosPorCategoria, serieTemporal, sumasMensualesDeAsientos, previsionTesoreria, antiguedadSaldos, vencimientosEstimados,
  rentabilidadPorDimension, cobrosPorMedio, asientoDesdeHecho, sumarDias, aFechaISO,
} from '../src/index.ts'
import type { Asiento, HechoContable } from '../src/index.ts'

const s = (cuenta: string, debe: number, haber: number, n = 1) => ({ cuenta, debe, haber, n })
const a = (fecha: string, apuntes: [string, number, number][], extra: Partial<Asiento> = {}): Asiento => ({
  fecha, ejercicio: Number(fecha.slice(0, 4)), concepto: 't', apuntes: apuntes.map(([cuenta, debe, haber]) => ({ cuenta, debe, haber })), ...extra,
})

test('KPI: libro vacío → TODOS null (incluido margen), ninguno 0', () => {
  for (const [k, v] of Object.entries(calcularKpis([], []))) assert.equal(v, null, k)
})

test('KPI: ventas, gastos, resultado, margen, IVA, caja, cobros y pagos pendientes con su fórmula', () => {
  const periodo = [s('705', 0, 100000), s('700', 500, 20000), s('600', 30000, 0), s('628', 5000, 0), s('477', 0, 25200), s('472', 7350, 0), s('759', 0, 1000)]
  const acum = [s('572', 150000, 40000), s('570', 2000, 0), s('430', 121000, 60000), s('400', 0, 36300), s('410', 1000, 6050)]
  const k = calcularKpis(periodo, acum)
  assert.equal(k.ventas, 119500)
  assert.equal(k.gastos, 35000)
  assert.equal(k.resultado, 85500)
  assert.equal(k.margenPct, 71) // 85.500 / 120.500 = 70,95 %
  assert.equal(k.ivaEstimado, 17850)
  assert.equal(k.caja, 112000)
  assert.equal(k.cobrosPendientes, 61000)
  assert.equal(k.pagosPendientes, 41350)
})

test('KPI: tres estados — compensados = 0 (dato); sin apuntes = null; margen null con ingresos 0', () => {
  const k = calcularKpis([s('705', 1000, 1000, 2)], [s('572', 100, 0)])
  assert.equal(k.ventas, 0); assert.equal(k.gastos, null); assert.equal(k.resultado, 0)
  assert.equal(k.margenPct, null); assert.equal(k.ivaEstimado, null); assert.equal(k.cobrosPendientes, null); assert.equal(k.caja, 100)
})

test('comparativas: pct sobre |anterior|, null si falta un lado o anterior = 0; sentido', () => {
  assert.equal(variacionPct(150, 100), 50)
  assert.equal(variacionPct(-50, -100), 50)
  assert.equal(variacionPct(10, 0), null)
  assert.equal(variacionPct(null, 5), null)
  assert.deepEqual(comparar(80, 100), { abs: -20, pct: -20, sentido: 'baja' })
  assert.equal(comparar(100, null), null)
  const t = tarjetasKpi(calcularKpis([s('705', 0, 200)], []), calcularKpis([s('705', 0, 100)], []), calcularKpis([], []))
  const v = t.find((x) => x.clave === 'ventas')!
  assert.equal(v.vsAnterior?.pct, 100)
  assert.equal(v.vsAnioPasado, null)
})

test('KPI sobre asientos con periodo anterior y mismo periodo del año pasado (reloj inyectado)', () => {
  const asientos = [
    a('2026-03-10', [['430', 12100, 0], ['705', 0, 10000], ['477', 0, 2100]]),
    a('2026-02-10', [['430', 6050, 0], ['705', 0, 5000], ['477', 0, 1050]]),
    a('2025-03-10', [['430', 3025, 0], ['705', 0, 2500], ['477', 0, 525]]),
  ]
  const r = rangosComparativa('mes', new Date(Date.UTC(2026, 2, 20)))
  assert.deepEqual(r.anioPasado, { desde: '2025-03-01', hasta: '2025-03-31' })
  assert.equal(kpisDeAsientos(asientos, r.actual).ventas, 10000)
  assert.equal(kpisDeAsientos(asientos, r.anterior).ventas, 5000)
  assert.equal(kpisDeAsientos(asientos, r.anioPasado).ventas, 2500)
  assert.equal(kpisDeAsientos(asientos, r.actual).cobrosPendientes, 21175) // acumulado hasta fin del periodo
  assert.equal(sumasDeAsientos(asientos, { hasta: '2026-02-28' }).find((x) => x.cuenta === '705')?.haber, 7500)
})

test('cubos y series: n cubos hasta hoy, huecos = null, resultado acumulado, caja acumulada, ventas año anterior', () => {
  const hoy = new Date(Date.UTC(2026, 3, 15))
  assert.deepEqual(cubosHasta('mes', hoy, 3).map((c) => c.clave), ['2026-02', '2026-03', '2026-04'])
  assert.deepEqual(cubosHasta('trimestre', hoy, 2).map((c) => c.etiqueta), ['T1 26', 'T2 26'])
  const asientos = [
    a('2025-03-05', [['572', 100, 0], ['705', 0, 100]]),
    a('2026-02-05', [['572', 1000, 0], ['705', 0, 1000]]),
    a('2026-04-05', [['600', 400, 0], ['572', 0, 400]]),
  ]
  const p = serieTemporal(sumasMensualesDeAsientos(asientos), 'mes', hoy, 3)
  assert.deepEqual(p.map((x) => x.ventas), [1000, null, null])
  assert.deepEqual(p.map((x) => x.gastos), [null, null, 400])
  assert.deepEqual(p.map((x) => x.resultado), [1000, null, -400])
  assert.deepEqual(p.map((x) => x.resultadoAcumulado), [1000, 1000, 600])
  assert.deepEqual(p.map((x) => x.caja), [1100, 1100, 700])
  assert.equal(p[0].margenPct, 100)
  const marzo = serieTemporal(sumasMensualesDeAsientos(asientos), 'mes', new Date(Date.UTC(2026, 2, 1)), 1)[0]
  assert.equal(marzo.ventasAnioAnterior, 100)
  assert.equal(serieTemporal([], 'mes', hoy, 2).every((x) => x.ventas === null && x.caja === null && x.resultadoAcumulado === null), true)
})

test('gastos por categoría: grupo 6 por cuenta de 3 dígitos, orden, % y sin datos', () => {
  assert.equal(gastosPorCategoria([s('705', 0, 5)]), null)
  const g = gastosPorCategoria([s('6281', 3000, 0), s('628', 1000, 0), s('621', 4000, 0), s('608', 0, 500), s('640', 2000, 0)])!
  assert.deepEqual(g.categorias.map((c) => [c.cuenta, c.importe]), [['621', 4000], ['628', 4000], ['640', 2000]])
  assert.equal(g.total, 9500)
  assert.equal(g.categorias[0].pct, 40)
  assert.equal(g.categorias.find((c) => c.cuenta === '640')?.nombre, 'Sueldos y salarios')
})

test('previsión 90 días: sin saldo de caja → null; plana sin vencimientos; con cobros y pagos; primer negativo; vencido entra el día 0', () => {
  const hoy = new Date(Date.UTC(2026, 5, 1))
  assert.equal(previsionTesoreria({ saldoCaja: null, vencimientos: [{ fecha: '2026-06-10', importe: 5 }], hoy }), null)
  const plana = previsionTesoreria({ saldoCaja: 1000, vencimientos: [], hoy })!
  assert.equal(plana.conVencimientos, false)
  assert.ok(plana.puntos.every((p) => p.saldo === 1000))
  assert.equal(plana.puntos.at(-1)!.fecha, '2026-08-30')
  const p = previsionTesoreria({
    saldoCaja: 1000, hoy,
    vencimientos: [{ fecha: '2026-05-20', importe: 200 }, { fecha: '2026-06-10', importe: -1500 }, { fecha: '2026-07-15', importe: 3000 }, { fecha: '2027-01-01', importe: -9999 }],
  })!
  assert.equal(p.puntos[0].saldo, 1200)
  assert.equal(p.primerNegativo, '2026-06-15')
  assert.equal(p.saldoMinimo, -300)
  assert.equal(p.puntos.at(-1)!.saldo, 2700)
})

test('antigüedad de saldos: tramos, saldo contrario aparte, sin datos → null; vencimientos estimados con signo', () => {
  const hoy = new Date(Date.UTC(2026, 5, 30))
  const dia = (n: number) => sumarDias(aFechaISO(hoy), -n)
  const partidas = [
    { cuenta: '430', documento: 'F1', desde: dia(10), debe: 1000, haber: 0 },
    { cuenta: '430', documento: 'F2', desde: dia(45), debe: 2000, haber: 500 },
    { cuenta: '430', documento: 'F3', desde: dia(100), debe: 3000, haber: 3000 },
    { cuenta: '430', documento: 'F4', desde: dia(100), debe: 4000, haber: 0 },
    { cuenta: '430', documento: 'A1', desde: dia(5), debe: 0, haber: 700 },
    { cuenta: '400', documento: 'P1', desde: dia(70), debe: 0, haber: 900 },
  ]
  const c = antiguedadSaldos(partidas, 'clientes', hoy)!
  assert.deepEqual(c.tramos, { '0-30': 1000, '31-60': 1500, '61-90': 0, '+90': 4000 })
  assert.equal(c.total, 6500)
  assert.deepEqual(c.aFavor.map((x) => [x.documento, x.importe]), [['A1', 700]])
  assert.equal(antiguedadSaldos(partidas, 'proveedores', hoy)!.tramos['61-90'], 900)
  assert.equal(antiguedadSaldos([], 'clientes', hoy), null)
  const v = vencimientosEstimados(partidas, 30)
  assert.equal(v.find((x) => x.ref === 'F1')!.importe, 1000)
  assert.equal(v.find((x) => x.ref === 'P1')!.importe, -900)
  assert.equal(v.some((x) => x.ref === 'F3' || x.ref === 'A1'), false)
})

test('rentabilidad por dimensión: ingresos − gastos por valor, «sin asignar» visible y al final, null ≠ 0, apunte pisa asiento', () => {
  const hecho = (tipo: 'venta' | 'compra', ref: string, base: number, dim?: Record<string, string>): HechoContable =>
    ({ tipo, fecha: '2026-03-10', ref, desglose: [{ base, tipoIva: 21 }], ...(dim ? { dimensiones: dim } : {}) }) as HechoContable
  const asientos = [
    asientoDesdeHecho(hecho('venta', 'F1', 10000, { ot: 'OT-1' })),
    asientoDesdeHecho(hecho('compra', 'C1', 4000, { ot: 'OT-1' })),
    asientoDesdeHecho(hecho('venta', 'F2', 5000, { ot: 'OT-2' })),
    asientoDesdeHecho(hecho('compra', 'C2', 7000, { ot: 'OT-3' })),
    asientoDesdeHecho(hecho('venta', 'F3', 1000)),
  ]
  const r = rentabilidadPorDimension(asientos, 'ot')
  assert.deepEqual(r.map((x) => x.valor), ['OT-1', 'OT-2', 'OT-3', null])
  assert.deepEqual(r[0], { valor: 'OT-1', ingresos: 10000, gastos: 4000, margen: 6000, margenPct: 60, n: 2 })
  const ot3 = r.find((x) => x.valor === 'OT-3')!
  assert.equal(ot3.ingresos, null); assert.equal(ot3.margen, -7000); assert.equal(ot3.margenPct, null)
  assert.equal(r.at(-1)!.valor, null)
  const pisado = [{ ...asientos[0], apuntes: asientos[0].apuntes.map((p) => (p.cuenta === '705' ? { ...p, dimensiones: { ot: 'OT-9' } } : p)) }]
  assert.deepEqual(rentabilidadPorDimension(pisado, 'ot').map((x) => x.valor), ['OT-9'])
  assert.throws(() => rentabilidadPorDimension([], 'Mal Nombre'))
  // Retrocompat: un hecho sin dimensiones genera el asiento de siempre (sin la clave).
  assert.equal('dimensiones' in asientos[4], false)
})

test('cobros por medio: reparte, medio desconocido/ausente = sin indicar, sin cobros → null', () => {
  assert.equal(cobrosPorMedio([]), null)
  const r = cobrosPorMedio([{ medio: 'bizum', importe: 100 }, { medio: 'efectivo', importe: 300 }, { medio: 'bizum', importe: 50 }, { medio: null, importe: 10 }, { medio: 'cheque', importe: 5 }])!
  assert.deepEqual(r.filas.map((f) => [f.medio, f.importe, f.n]), [['efectivo', 300, 1], ['bizum', 150, 2], [null, 15, 2]])
  assert.equal(r.total, 465)
})
