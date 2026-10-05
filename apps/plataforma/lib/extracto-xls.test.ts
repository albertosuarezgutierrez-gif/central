// Saldo final del Excel de movimientos. Filas del fichero REAL de BBVA («Últimos movimientos»,
// 04/10/2026, orden DESCENDENTE: la primera fila es el movimiento más reciente), anonimizadas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseExtractoXls } from './extracto-xls.ts'

const CAB = ['F.Valor', 'Fecha', 'Concepto', 'Movimiento', 'Importe', 'Divisa', 'Disponible', 'Divisa', 'Observaciones']
const libro = (filas: unknown[][]) => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[], ['', '', 'Últimos movimientos'], [], CAB, ...filas]), 'Hoja1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('BBVA descendente con empate de fecha: saldo final = primera fila del día más reciente', () => {
  const buf = libro([
    ['30/09/2026', '02/10/2026', 'Pago A', 'Pago con tarjeta', -170, 'EUR', 18386.72, 'EUR', ''],
    ['02/10/2026', '02/10/2026', 'Transferencia recibida', 'Saldo cuenta', 704.53, 'EUR', 18556.72, 'EUR', ''],
    ['02/10/2026', '02/10/2026', 'Bizum', 'Recibido: a', 25, 'EUR', 17852.19, 'EUR', ''],
    ['02/10/2026', '02/10/2026', 'Bizum', 'Recibido: b', 12, 'EUR', 17827.19, 'EUR', ''],
    ['01/10/2026', '01/10/2026', 'Bizum', 'Recibido: c', 5, 'EUR', 17815.19, 'EUR', ''],
  ])
  const [e] = parseExtractoXls(buf)
  assert.equal(e.saldoFinal, 18386.72)
  assert.equal(e.fechaInicio, '2026-10-01')
  assert.equal(e.fechaFin, '2026-10-02')
})

test('descendente sin saldo encadenable: manda el orden del fichero (primera fila)', () => {
  const buf = libro([
    ['02/10/2026', '02/10/2026', 'X', 'x', 10, 'EUR', 500, 'EUR', ''],
    ['02/10/2026', '02/10/2026', 'Y', 'y', 10, 'EUR', 999, 'EUR', ''],
    ['01/10/2026', '01/10/2026', 'Z', 'z', 10, 'EUR', 100, 'EUR', ''],
  ])
  assert.equal(parseExtractoXls(buf)[0].saldoFinal, 500)
})

test('Kutxabank ascendente sigue igual: saldo final = última fila del día más reciente', () => {
  const buf = libro([
    ['01/10/2026', '01/10/2026', 'A', 'a', 10, 'EUR', 100, 'EUR', ''],
    ['02/10/2026', '02/10/2026', 'B', 'b', 20, 'EUR', 120, 'EUR', ''],
    ['02/10/2026', '02/10/2026', 'C', 'c', -5, 'EUR', 115, 'EUR', ''],
  ])
  assert.equal(parseExtractoXls(buf)[0].saldoFinal, 115)
})
