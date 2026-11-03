import { test } from 'node:test'
import assert from 'node:assert'
import { aCentimos, desglosarDesdeTotal } from './importes.ts'

test('IVA incluido: base + cuota = total SIEMPRE, al céntimo', () => {
  for (const tipo of [0, 4, 10, 21]) {
    for (let c = 1; c <= 200_000; c += 37) {
      const total = c / 100
      const r = desglosarDesdeTotal(total, tipo)
      assert.equal(aCentimos(r.base) + aCentimos(r.cuota), c, `${total} al ${tipo}%`)
      assert.equal(r.total, total)
    }
  }
})

test('casos conocidos (10 %)', () => {
  assert.deepEqual(desglosarDesdeTotal(110, 10), { total: 110, base: 100, cuota: 10, tipoIva: 10 })
  assert.deepEqual(desglosarDesdeTotal(363, 10), { total: 363, base: 330, cuota: 33, tipoIva: 10 })
  assert.deepEqual(desglosarDesdeTotal(100, 10), { total: 100, base: 90.91, cuota: 9.09, tipoIva: 10 })
  // 1785,10 / 1,10 = 1622,8181… → 1622,82 y cuota 162,28
  assert.deepEqual(desglosarDesdeTotal(1785.1, 10), { total: 1785.1, base: 1622.82, cuota: 162.28, tipoIva: 10 })
  // Redondeo del medio céntimo: 0,11 / 1,10 = 0,1 exacto; 0,05/1,10 = 0,04545 → 0,05 y cuota 0,00
  assert.deepEqual(desglosarDesdeTotal(0.05, 10), { total: 0.05, base: 0.05, cuota: 0, tipoIva: 10 })
})

test('IVA 0: base = total, cuota 0', () => {
  assert.deepEqual(desglosarDesdeTotal(501.48, 0), { total: 501.48, base: 501.48, cuota: 0, tipoIva: 0 })
})

test('aCentimos corrige la coma flotante', () => {
  assert.equal(aCentimos(1.005), 101)
  assert.equal(aCentimos(0.1 + 0.2), 30)
})

test('importes o tipos no válidos lanzan (nunca se factura 0 ni un IVA inventado)', () => {
  for (const t of [0, -1, NaN, Infinity, 0.001]) assert.throws(() => desglosarDesdeTotal(t, 10), String(t))
  for (const iva of [-1, 22, NaN, null as unknown as number]) assert.throws(() => desglosarDesdeTotal(100, iva), String(iva))
})
