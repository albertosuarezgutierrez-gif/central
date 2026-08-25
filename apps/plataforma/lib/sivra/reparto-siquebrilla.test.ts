import test from 'node:test'
import assert from 'node:assert/strict'
import { elegirMesFacturado, esperadoLimpieza, repartirPagoSiqueBrilla } from './reparto-siquebrilla.ts'

// Tarifas contratadas (mismas que LIMPIEZA_TARIFAS de pl-mensual.ts)
const TARIFAS: Record<string, number> = {
  prop_busto_reform: 20,
  prop_duplex_center: 25,
  prop_luxury_busto: 28,
  prop_house_sevillana: 90,
}

// Fixture REAL: factura 2025/333 de Sique Brilla (julio 2026, pagada 03/08/2026).
// LUXURY 4×28 + BUSTOS REFORMA 2×20 + DUPLEX 2×25 + CASA SOCORRO 3×90 = 472€ de limpieza
// + lavandería 86,18 + 86,53 = 172,71€ · base 644,71€ · IVA 135,39€ · total 780,10€.
const SALIDAS_JULIO = new Map([
  ['prop_luxury_busto', 4],
  ['prop_busto_reform', 2],
  ['prop_duplex_center', 2],
  ['prop_house_sevillana', 3],
])

test('factura real de julio: limpieza por salidas×tarifa con IVA y el resto es lavandería', () => {
  const r = repartirPagoSiqueBrilla(780.10, SALIDAS_JULIO, TARIFAS)
  assert.ok(r)
  assert.equal(r.limpieza.get('prop_house_sevillana'), 326.70) // 270€ + IVA
  assert.equal(r.limpieza.get('prop_luxury_busto'), 135.52)    // 112€ + IVA
  assert.equal(r.limpieza.get('prop_busto_reform'), 48.40)     // 40€ + IVA
  assert.equal(r.limpieza.get('prop_duplex_center'), 60.50)    // 50€ + IVA
  assert.equal(r.lavanderia, 208.98)                           // 172,71€ + IVA
  const suma = [...r.limpieza.values()].reduce((s, n) => s + n, 0) + r.lavanderia
  assert.ok(Math.abs(suma - 780.10) < 0.02)
})

test('sin salidas del mes facturado devuelve null (no se puede desglosar), nunca un reparto inventado', () => {
  assert.equal(repartirPagoSiqueBrilla(780.10, new Map(), TARIFAS), null)
  assert.equal(repartirPagoSiqueBrilla(780.10, new Map([['prop_desconocido', 3]]), TARIFAS), null)
})

test('total no positivo devuelve null', () => {
  assert.equal(repartirPagoSiqueBrilla(0, SALIDAS_JULIO, TARIFAS), null)
  assert.equal(repartirPagoSiqueBrilla(-780.10, SALIDAS_JULIO, TARIFAS), null)
})

test('pago parcial: se reparte en proporción y no se afirma lavandería', () => {
  // La limpieza esperada de julio con IVA es 571,12€; un pago de 285,56€ es justo la mitad.
  const r = repartirPagoSiqueBrilla(285.56, SALIDAS_JULIO, TARIFAS)
  assert.ok(r)
  assert.equal(r.lavanderia, 0)
  assert.equal(r.limpieza.get('prop_house_sevillana'), 163.35) // 326,70 / 2
  const suma = [...r.limpieza.values()].reduce((s, n) => s + n, 0)
  assert.ok(Math.abs(suma - 285.56) < 0.02)
})

// Salidas por mes según `incomes` (verificadas contra la BD real el 25/08/2026)
const SALIDAS = {
  '2026-03': new Map([['prop_busto_reform', 8], ['prop_duplex_center', 8], ['prop_house_sevillana', 4], ['prop_luxury_busto', 6]]),
  '2026-04': new Map([['prop_busto_reform', 6], ['prop_duplex_center', 9], ['prop_house_sevillana', 6], ['prop_luxury_busto', 10]]),
  '2026-05': new Map([['prop_busto_reform', 6], ['prop_duplex_center', 7], ['prop_house_sevillana', 7], ['prop_luxury_busto', 8]]),
  '2026-06': new Map([['prop_busto_reform', 3], ['prop_duplex_center', 4], ['prop_house_sevillana', 4], ['prop_luxury_busto', 6]]),
  '2026-07': SALIDAS_JULIO,
  '2026-08': new Map([['prop_duplex_center', 1], ['prop_house_sevillana', 1]]),
}

test('la factura de marzo (solo limpieza) cuadra al céntimo con salidas × tarifa × IVA', () => {
  // Pago real 03/04/2026: 1.074,48€ «LIMPIEZA APARTAMENTOS» = 888€ base × 1,21.
  assert.equal(esperadoLimpieza(SALIDAS['2026-03'], TARIFAS), 1074.48)
})

test('elegirMesFacturado: pago a primeros del mes elige el mes ANTERIOR', () => {
  // 03/04 paga marzo (ajuste exacto), no abril (esperado 1.409,65).
  const abril = { mes: '2026-04', salidas: SALIDAS['2026-04'] }
  const marzo = { mes: '2026-03', salidas: SALIDAS['2026-03'] }
  assert.equal(elegirMesFacturado(1074.48, [marzo, abril], TARIFAS)?.mes, '2026-03')
  // 03/08 paga julio (resto 208,98 de lavandería), no agosto (resto 640,95).
  const julio = { mes: '2026-07', salidas: SALIDAS['2026-07'] }
  const agosto = { mes: '2026-08', salidas: SALIDAS['2026-08'] }
  assert.equal(elegirMesFacturado(780.10, [julio, agosto], TARIFAS)?.mes, '2026-07')
})

test('elegirMesFacturado: pago a fin de mes elige el MISMO mes de caja', () => {
  // 30/04/2026: 1.439,90€ «LIMPIEZA APARTAMENTOS ABRIL» — abril (resto 30,25) gana a marzo (resto 365,42).
  const marzo = { mes: '2026-03', salidas: SALIDAS['2026-03'] }
  const abril = { mes: '2026-04', salidas: SALIDAS['2026-04'] }
  assert.equal(elegirMesFacturado(1439.90, [marzo, abril], TARIFAS)?.mes, '2026-04')
  // 30/06/2026: 902,65€ — junio (resto 70,17) gana a mayo (déficit 487,64).
  const mayo = { mes: '2026-05', salidas: SALIDAS['2026-05'] }
  const junio = { mes: '2026-06', salidas: SALIDAS['2026-06'] }
  assert.equal(elegirMesFacturado(902.65, [mayo, junio], TARIFAS)?.mes, '2026-06')
})

test('elegirMesFacturado: un pago por DEBAJO de lo esperado también elige por ajuste (02/06 → mayo)', () => {
  // 02/06/2026: 1.360,04€ «LIMPIEZA APARTAMENTOS MAYO»; esperado mayo 1.390,29 (diff 30,25)
  // vs junio 832,48 (diff 527,56). Gana mayo aunque el pago no llegue al esperado.
  const mayo = { mes: '2026-05', salidas: SALIDAS['2026-05'] }
  const junio = { mes: '2026-06', salidas: SALIDAS['2026-06'] }
  assert.equal(elegirMesFacturado(1360.04, [mayo, junio], TARIFAS)?.mes, '2026-05')
  const r = repartirPagoSiqueBrilla(1360.04, SALIDAS['2026-05'], TARIFAS)
  assert.ok(r)
  assert.equal(r.lavanderia, 0) // pago parcial: no se afirma lavandería
})

test('elegirMesFacturado: sin candidatos con salidas devuelve null', () => {
  assert.equal(elegirMesFacturado(780.10, [{ salidas: new Map<string, number>() }], TARIFAS), null)
})

test('un piso con salidas pero sin tarifa conocida no recibe limpieza', () => {
  const r = repartirPagoSiqueBrilla(200, new Map([
    ['prop_house_sevillana', 1],
    ['prop_desconocido', 5],
  ]), TARIFAS)
  assert.ok(r)
  assert.equal(r.limpieza.has('prop_desconocido'), false)
  assert.equal(r.limpieza.get('prop_house_sevillana'), 108.90) // 90€ + IVA
  assert.equal(r.lavanderia, 91.10)
})
