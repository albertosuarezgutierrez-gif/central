import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recortarTextoDocumento, MAX_TEXTO_EXTRACCION, MARCA_CORTE } from './recorte-texto.ts'

test('un documento corto va entero', () => {
  const t = 'FACTURA 1\nTotal 10,00'
  assert.equal(recortarTextoDocumento(t), t)
})

test('un documento largo conserva el principio Y el pie (donde va «comisión de mediador»)', () => {
  const t = 'CABECERA Allianz\n' + 'línea de detalle\n'.repeat(3000) + 'PIE: liquidación de comisiones al mediador'
  const r = recortarTextoDocumento(t)
  assert.ok(r.length <= MAX_TEXTO_EXTRACCION)
  assert.ok(r.startsWith('CABECERA Allianz'))
  assert.ok(r.endsWith('PIE: liquidación de comisiones al mediador'))
  assert.ok(r.includes(MARCA_CORTE))
})

test('ya no se corta a 4.000 caracteres: un texto de 9.000 va entero', () => {
  const t = 'x'.repeat(8_990) + 'TOTAL 659,43'
  assert.equal(recortarTextoDocumento(t), t)
})
