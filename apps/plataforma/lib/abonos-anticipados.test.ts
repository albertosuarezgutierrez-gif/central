// Runner: `node --test --experimental-strip-types lib/abonos-anticipados.test.ts`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarAbono, detectarAbonosAnticipados, esAbonoAnticipado, type MovAbono } from './abonos-anticipados.ts'

const CONC = (mm: string, aaaa = 2026) => `TRANSF. DEVOLUCIONES TRIBUTARIAS, AEAT APLSOLICITUD DEDUCCION MATERNIDAD 26MOD140INFSUAREZ PI-${mm}-${aaaa}`
const mov = (fecha: string, mm: string | null, importe = 100, extra: Partial<MovAbono> = {}): MovAbono =>
  ({ fecha, importe, concepto: mm ? CONC(mm) : 'TRANSF. DEVOLUCIONES TRIBUTARIAS, AEAT', contraparte: 'DEVOLUCIONES TRIBUTARIAS AGENC', duplicado_estado: null, ...extra })

test('detección por concepto: 140 (cualquier importe), 143, 100 € sin etiqueta = 140 supuesto, renta no cuenta', () => {
  assert.deepEqual(clasificarAbono(mov('2026-08-20', '07', 93.2)), { modelo: 140, supuesto: false, anio: 2026, mes: 7, conEtiqueta: true })
  assert.equal(clasificarAbono(mov('2026-08-20', null, 100, { concepto: 'ABONO MOD143 PI-05-2026' }))?.modelo, 143)
  assert.equal(clasificarAbono(mov('2026-08-20', null, 100, { concepto: 'AEAT FAMILIA NUMEROSA' }))?.modelo, 143)
  const s = clasificarAbono(mov('2026-03-20', null))
  assert.equal(s?.modelo, 140); assert.equal(s?.supuesto, true)
  assert.equal(esAbonoAnticipado(mov('2026-06-20', null, 93.2)), false) // devolución de renta (importe ≠ 100, sin etiqueta de modelo)
  assert.equal(esAbonoAnticipado(mov('2026-06-20', null, 1234.5)), false)
  assert.equal(esAbonoAnticipado(mov('2026-03-20', '02', 100, { duplicado_estado: 'ignorado' })), false)
  assert.equal(esAbonoAnticipado(mov('2026-03-20', null, 100, { concepto: 'TRANSFERENCIA', contraparte: 'JUAN' })), false)
})

test('imputación: etiqueta -MM-AAAA manda sobre la fecha de cobro; sin etiqueta, mes anterior (17/01/2026 → 12/2025, fuera)', () => {
  assert.deepEqual([clasificarAbono(mov('2026-03-02', '02'))!.anio, clasificarAbono(mov('2026-03-02', '02'))!.mes], [2026, 2])
  const sin = clasificarAbono(mov('2026-01-17', null))!
  assert.deepEqual([sin.anio, sin.mes, sin.conEtiqueta], [2025, 12, false])
  const r = detectarAbonosAnticipados([mov('2026-01-17', null), mov('2026-02-25', null), mov('2026-02-26', null)], 2026, '2026-03-01')
  assert.equal(r.n, 2); assert.equal(r.real, 200); assert.deepEqual(r.desglose.map(d => d.mes), [1])
  // etiqueta de 2025 cobrada en 2026 no cuenta; etiqueta de 2026 cobrada en enero 2027 sí
  assert.equal(detectarAbonosAnticipados([{ ...mov('2026-01-20', '12'), concepto: CONC('12', 2025) }], 2026, '2026-02-01').n, 0)
  assert.equal(detectarAbonosAnticipados([mov('2027-01-20', '12')], 2026, '2027-02-01').real, 100)
})

test('desglose por mes y modelo; 93,20 de julio cuenta; proyección al ritmo del ÚLTIMO mes', () => {
  const movs = [mov('2026-02-25', null), mov('2026-03-20', '03'), mov('2026-07-20', '07', 93.2), mov('2026-08-20', '08'), mov('2026-09-18', '09'), mov('2026-10-23', '10'),
    mov('2026-10-24', '10', 100, { duplicado_estado: 'ignorado' }), mov('2026-04-20', '04', 50, { concepto: 'MOD143 PI-04-2026' })]
  const r = detectarAbonosAnticipados(movs, 2026, '2026-11-03')
  assert.equal(r.real140, 593.2); assert.equal(r.real143, 50); assert.equal(r.real, 643.2); assert.equal(r.n, 7); assert.equal(r.supuestos, 1)
  assert.equal(r.ultimoMes, 10)
  assert.equal(r.estimado140, 200); assert.equal(r.estimado143, 0); assert.equal(r.total, 843.2)
  assert.deepEqual(r.desglose.find(d => d.mes === 7), { mes: 7, modelo: 140, importe: 93.2, n: 1, supuesto: false })
  assert.deepEqual(r.desglose.find(d => d.mes === 1), { mes: 1, modelo: 140, importe: 100, n: 1, supuesto: true })
})

test('proyección: año en curso y último mes ETIQUETADO ≥ mes actual − 2 (no la fecha de cobro); diciembre y sin abonos: 0', () => {
  const movs = [mov('2026-08-20', '08'), mov('2026-09-18', '09'), mov('2026-11-03', '10')] // cobrado en nov, etiquetado oct
  assert.equal(detectarAbonosAnticipados(movs, 2026, '2026-11-03').estimado, 200)
  assert.equal(detectarAbonosAnticipados(movs, 2026, '2026-12-03').estimado, 200) // oct ≥ dic−2: vivo
  assert.equal(detectarAbonosAnticipados(movs, 2026, '2027-01-10').estimado, 0) // otro año
  assert.equal(detectarAbonosAnticipados([mov('2026-08-20', '08'), mov('2026-09-18', '09')], 2026, '2026-11-03').estimado, 300) // hoy: último 09 ≥ 11−2, meses 10–12
  assert.equal(detectarAbonosAnticipados([mov('2026-08-20', '08'), mov('2026-09-18', '09')], 2026, '2026-12-03').estimado, 0) // 09 < 12−2: interrumpido
  assert.equal(detectarAbonosAnticipados(movs, 2027, '2027-01-10').estimado, 0)
  assert.equal(detectarAbonosAnticipados(movs, 2026, '2027-01-10').estimado, 0) // ejercicio cerrado
  assert.equal(detectarAbonosAnticipados([mov('2026-07-20', '07')], 2026, '2026-11-03').estimado, 0) // interrumpido: último jul < sep
  assert.equal(detectarAbonosAnticipados([mov('2026-12-18', '12')], 2026, '2026-12-20').estimado, 0)
  const v = detectarAbonosAnticipados([], 2026, '2026-11-03')
  assert.deepEqual(v, { real: 0, n: 0, ultimoMes: null, estimado: 0, total: 0, real140: 0, real143: 0, estimado140: 0, estimado143: 0, supuestos: 0, desglose: [] })
})
