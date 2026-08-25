import test from 'node:test'
import assert from 'node:assert/strict'
import { repartirPagoSiqueBrilla } from './reparto-siquebrilla.ts'

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
