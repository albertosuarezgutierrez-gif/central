// Cepos del libro registro en plataforma: una fila rara no se exporta, la prima vacía es «no consta»
// y un texto que Excel ejecutaría como fórmula se neutraliza.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvLibro, interpretarLibro } from '../apps/plataforma/lib/libro-registro-asegura.ts'

const fila = { numeroPoliza: '123', compania: 'Mapfre', ramo: 'auto', tomador: 'Ana Pérez', efecto: '2024-01-01', vencimiento: '2026-01-01', estado: 'activa', prima: 312.4 }

test('lee filas buenas y el CSV lleva coma decimal', () => {
  const l = interpretarLibro(200, { estado: 'ok', año: 2025, filas: [fila] })
  assert.equal(l.estado, 'ok')
  if (l.estado === 'ok') assert.match(csvLibro(l), /;312,40\n$/)
})

test('🪤 una fila con una prima no numérica tumba la lectura', () => {
  assert.equal(interpretarLibro(200, { estado: 'ok', año: 2025, filas: [{ ...fila, prima: '312' }] }).estado, 'error')
})

test('🪤 prima null = celda vacía y la cabecera explica que es «no consta»', () => {
  const csv = csvLibro({ año: 2025, filas: [{ ...fila, prima: null }] })
  assert.match(csv.split('\n')[0], /Prima vacía = no consta/)
  assert.match(csv, /;activa;\n$/)
})

test('🪤 un tomador que empieza por = no se ejecuta en Excel', () => {
  assert.match(csvLibro({ año: 2025, filas: [{ ...fila, tomador: '=CMD()' }] }), /;'=CMD\(\);/)
})
