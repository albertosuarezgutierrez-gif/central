// Tests del parser PURO de Norma 43. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseNorma43, dedupeHash } from './norma43.ts'

// Construye un registro de 80 chars a partir de [valor, ancho]. Los numéricos se
// dan con su valor lógico (el parser ignora alineación y ceros). Texto: alinea izq.
function rec(fields: Array<[string, number]>): string {
  let s = ''
  for (const [val, width] of fields) {
    s += val.length >= width ? val.slice(0, width) : val + ' '.repeat(width - val.length)
  }
  assert.equal(s.length, 80, `registro de ${s.length} chars (debe ser 80)`)
  return s
}

const FICHERO = [
  // 11 cabecera: entidad 0049, oficina 1500, cuenta 1234567890, saldo inicial 1000,00 (haber)
  rec([['11', 2], ['0049', 4], ['1500', 4], ['1234567890', 10], ['260101', 6], ['260131', 6],
       ['2', 1], ['100000', 14], ['978', 3], ['3', 1], ['BANCO EJEMPLO SA', 26], ['', 3]]),
  // 22 mov1: cargo 500,00 el 2026-01-02
  rec([['22', 2], ['', 4], ['1500', 4], ['260102', 6], ['260102', 6], ['12', 2], ['001', 3],
       ['1', 1], ['50000', 14], ['DOC0000001', 10], ['REF1', 12], ['REF2', 16]]),
  rec([['23', 2], ['01', 2], ['PAGO PROVEEDOR ACME SL', 38], ['FACTURA 2026-001', 38]]),
  // 22 mov2: abono 750,00 el 2026-01-03
  rec([['22', 2], ['', 4], ['1500', 4], ['260103', 6], ['260103', 6], ['05', 2], ['002', 3],
       ['2', 1], ['75000', 14], ['DOC0000002', 10], ['REF1B', 12], ['REF2B', 16]]),
  rec([['23', 2], ['01', 2], ['TRANSFERENCIA CLIENTE XYZ', 38], ['ALQUILER ENERO', 38]]),
  // 33 fin de cuenta: saldo final 1250,00 (haber)
  rec([['33', 2], ['0049', 4], ['1500', 4], ['1234567890', 10], ['00001', 5], ['50000', 14],
       ['00001', 5], ['75000', 14], ['2', 1], ['125000', 14], ['978', 3], ['', 4]]),
  // 88 fin de fichero
  rec([['88', 2], ['', 78]]),
].join('\r\n')

test('parseNorma43: una cuenta con cabecera, saldos y dos movimientos', () => {
  const ex = parseNorma43(FICHERO)
  assert.equal(ex.length, 1)
  const e = ex[0]
  assert.equal(e.ccc, '004915001234567890')
  assert.equal(e.banco, 'BANCO EJEMPLO SA')
  assert.equal(e.saldoInicial, 1000)
  assert.equal(e.saldoFinal, 1250)
  assert.equal(e.fechaInicio, '2026-01-01')
  assert.equal(e.movimientos.length, 2)
})

test('parseNorma43: signos, fechas y concepto de los movimientos', () => {
  const [e] = parseNorma43(FICHERO)
  const [m1, m2] = e.movimientos
  assert.equal(m1.importe, -500)           // cargo (clave 1)
  assert.equal(m1.fechaOperacion, '2026-01-02')
  assert.match(m1.concepto, /PAGO PROVEEDOR ACME SL/)
  assert.match(m1.concepto, /FACTURA 2026-001/)
  assert.equal(m1.contraparte, 'PAGO PROVEEDOR ACME SL')
  assert.match(m1.referencia, /DOC0000001/)
  assert.equal(m2.importe, 750)            // abono (clave 2)
  assert.equal(m2.fechaOperacion, '2026-01-03')
})

test('parseNorma43: el saldo cuadra (inicial + movimientos = final)', () => {
  const [e] = parseNorma43(FICHERO)
  const suma = e.movimientos.reduce((s, m) => s + m.importe, e.saldoInicial)
  assert.equal(suma, e.saldoFinal)
})

test('dedupeHash: estable e distinto por movimiento', () => {
  const [e] = parseNorma43(FICHERO)
  const [m1, m2] = e.movimientos
  assert.equal(dedupeHash(m1), dedupeHash(m1))
  assert.notEqual(dedupeHash(m1), dedupeHash(m2))
})
