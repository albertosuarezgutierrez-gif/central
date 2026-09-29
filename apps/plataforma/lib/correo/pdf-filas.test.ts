import test from 'node:test'
import assert from 'node:assert/strict'
import { filasDeTrozos } from './pdf-filas.ts'

test('filas por altura, de arriba abajo; hueco grande = celda, pequeño = espacio', () => {
  // Posiciones como las de la carta de Allianz (pdf.js: y crece hacia arriba).
  const filas = filasDeTrozos([
    { x: 60, y: 400, w: 5, s: '1' },
    { x: 80, y: 400, w: 40, s: '040000001' },
    { x: 140, y: 400, w: 40, s: '600000001' },
    { x: 300, y: 400, w: 40, s: 'DISCONFORM' },
    { x: 342, y: 400, w: 20, s: '****' },
    { x: 80, y: 500, w: 20, s: 'Nº' },
    { x: 300, y: 390.4, w: 30, s: 'E IMPORTE' },
  ])
  assert.deepEqual(filas, ['Nº', '1\t040000001\t600000001\tDISCONFORM ****', 'E IMPORTE'])
})
