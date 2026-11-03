// Runner: `node --test --experimental-strip-types lib/abonos-anticipados.test.ts`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarAbonosAnticipados, esAbonoAnticipado, type MovAbono } from './abonos-anticipados.ts'

const mov = (fecha: string, importe = 100, extra: Partial<MovAbono> = {}): MovAbono =>
  ({ fecha, importe, concepto: 'TRANSF. DEVOLUCIONES TRIBUTARIAS, AEAT', contraparte: 'DEVOLUCIONES TRIBUTARIAS AGENC', duplicado_estado: null, ...extra })

test('solo cuenta 100,00 € de DEVOLUCIONES TRIBUTARIAS sin duplicado ignorado', () => {
  assert.equal(esAbonoAnticipado(mov('2026-03-20')), true)
  assert.equal(esAbonoAnticipado(mov('2026-08-20', 93.2)), false)
  assert.equal(esAbonoAnticipado(mov('2026-03-20', 100, { duplicado_estado: 'ignorado' })), false)
  assert.equal(esAbonoAnticipado(mov('2026-03-20', 100, { concepto: 'TRANSFERENCIA', contraparte: 'JUAN' })), false)
})

test('real del año + proyección a 31/12 con la media de los últimos 3 meses', () => {
  const movs = [mov('2026-08-20'), mov('2026-08-21'), mov('2026-09-18'), mov('2026-10-23'), mov('2026-10-24'), mov('2026-10-24', 100, { duplicado_estado: 'ignorado' }),
    mov('2026-08-20', 93.2), mov('2025-12-20')]
  const r = detectarAbonosAnticipados(movs, 2026)
  assert.equal(r.real, 500); assert.equal(r.n, 5); assert.equal(r.ultimoMes, 10)
  assert.equal(r.estimado, 333.33); // ago 200 + sep 100 + oct 200 = 500 → 166,67/mes × 2
  assert.equal(r.total, 833.33)
})

test('abono en diciembre: sin proyección; sin abonos: ultimoMes null y 0', () => {
  assert.equal(detectarAbonosAnticipados([mov('2026-12-18')], 2026).estimado, 0)
  const v = detectarAbonosAnticipados([], 2026)
  assert.deepEqual(v, { real: 0, n: 0, ultimoMes: null, estimado: 0, total: 0 })
})
