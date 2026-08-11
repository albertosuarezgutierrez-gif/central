// Tests del parser puro de extractos en CSV. Runner: `node --test` (type-stripping).
// La muestra reproduce el formato que EXPORTA la propia plataforma (`/api/banca/export`):
// BOM + separador ';' + coma decimal + fecha ISO + columna "Banco" con dos bancos.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseExtractoCsv } from './extracto-csv.ts'

const CSV = '﻿' + [
  'Fecha;Valor;Sociedad;Banco;Concepto;Contraparte;Categoría;Cuenta PGC;Negocio;Importe (€);Conciliado',
  '2025-01-01;2025-01-01;Alberto Suárez Gutiérrez;Kutxabank;TARJ.CRDTO 4662032019750300;;transferencia;572;🔁 Traspaso interno;-986,70;No',
  '2025-01-02;2025-01-02;Alberto Suárez Gutiérrez;BBVA;M1454;;cobro_cliente;700;🛡️ Seguros;74,40;No',
  '2025-01-03;2025-01-03;Alberto Suárez Gutiérrez;Kutxabank;ABONO STRIPE;;cobro_cliente;700;🏖️ Pisos;1.056,05;No',
].join('\r\n')

test('agrupa por banco: una cuenta por banco distinto', () => {
  const extractos = parseExtractoCsv(Buffer.from(CSV, 'utf8'))
  assert.equal(extractos.length, 2)
  const kutxa = extractos.find(e => e.banco === 'Kutxabank')!
  const bbva = extractos.find(e => e.banco === 'BBVA')!
  assert.equal(kutxa.ccc, 'IMPORTADO-Kutxabank')
  assert.equal(bbva.ccc, 'IMPORTADO-BBVA')
  assert.equal(kutxa.movimientos.length, 2)
  assert.equal(bbva.movimientos.length, 1)
})

test('parsea importes es-ES (coma decimal, separador de miles) con signo', () => {
  const extractos = parseExtractoCsv(Buffer.from(CSV, 'utf8'))
  const kutxa = extractos.find(e => e.banco === 'Kutxabank')!
  const [cargo, abono] = kutxa.movimientos
  assert.equal(cargo.importe, -986.70)
  assert.equal(cargo.concepto, 'TARJ.CRDTO 4662032019750300')
  assert.equal(abono.importe, 1056.05)   // "1.056,05"
  assert.equal(kutxa.fechaInicio, '2025-01-01')
  assert.equal(kutxa.fechaFin, '2025-01-03')
})

test('CSV de un solo banco respeta el iban/banco del formulario', () => {
  const uno = '﻿' + [
    'Fecha;Banco;Concepto;Importe (€)',
    '2025-02-01;Kutxabank;RECIBO LUZ;-52,77',
  ].join('\n')
  const [ex] = parseExtractoCsv(Buffer.from(uno, 'utf8'), { iban: 'ES1234', banco: 'Mi Kutxa' })
  assert.equal(ex.ccc, 'ES1234')
  assert.equal(ex.banco, 'Mi Kutxa')
  assert.equal(ex.movimientos[0].importe, -52.77)
})

test('autodetecta separador coma y salta filas de total', () => {
  const coma = [
    'Fecha,Concepto,Importe',
    '2025-03-01,COMPRA,-10.00',       // punto decimal (sin separador de miles ambiguo)
    'TOTAL,,',                        // fila de pie: sin fecha/importe válidos → se salta
  ].join('\n')
  const [ex] = parseExtractoCsv(Buffer.from(coma, 'utf8'))
  assert.equal(ex.movimientos.length, 1)
  assert.equal(ex.movimientos[0].importe, -10)
  assert.equal(ex.ccc, 'CUENTA-IMPORTADA')
})

test('respeta comillas con separador dentro del concepto', () => {
  const q = [
    'Fecha;Concepto;Importe (€)',
    '2025-04-01;"PAGO A; PROVEEDOR ""ACME""";-30,00',
  ].join('\n')
  const [ex] = parseExtractoCsv(Buffer.from(q, 'utf8'))
  assert.equal(ex.movimientos[0].concepto, 'PAGO A; PROVEEDOR "ACME"')
  assert.equal(ex.movimientos[0].importe, -30)
})

test('devuelve [] si no hay cabecera reconocible', () => {
  assert.deepEqual(parseExtractoCsv(Buffer.from('hola\nmundo', 'utf8')), [])
  assert.deepEqual(parseExtractoCsv(Buffer.from('', 'utf8')), [])
})
