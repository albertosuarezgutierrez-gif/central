import test from 'node:test'
import assert from 'node:assert/strict'
import { etiquetaClaseRecibo, textoFechaSituacion } from './recibo-etiquetas.ts'

test('clase: códigos conocidos', () => {
  assert.equal(etiquetaClaseRecibo('CA'), 'Cartera (renovación)')
  assert.equal(etiquetaClaseRecibo('NP'), 'Nueva producción')
  assert.equal(etiquetaClaseRecibo('SU'), 'Suplemento')
})
test('clase: desconocido crudo, NULL es —', () => {
  assert.equal(etiquetaClaseRecibo('XZ'), 'XZ')
  assert.equal(etiquetaClaseRecibo(null), '—')
  assert.equal(etiquetaClaseRecibo('  '), '—')
})
test('fecha de situación: cobrado/devuelto/anulado con fecha', () => {
  assert.equal(textoFechaSituacion('cobrado', '2026-03-05'), 'cobrado el 05/03/2026')
  assert.equal(textoFechaSituacion('devuelto', '2026-03-05T00:00:00.000Z'), 'devuelto el 05/03/2026')
  assert.equal(textoFechaSituacion('anulado', '2026-01-31'), 'anulado el 31/01/2026')
})
test('fecha de situación: sin fecha legible u otra situación, nada', () => {
  assert.equal(textoFechaSituacion('cobrado', null), null)
  assert.equal(textoFechaSituacion('cobrado', 'basura'), null)
  assert.equal(textoFechaSituacion('pendiente', '2026-03-05'), null)
})
