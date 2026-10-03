import test from 'node:test'
import assert from 'node:assert/strict'
import { conteoPlural, etiquetaClaseRecibo, rotuloClave, textoFechaSituacion } from './recibo-etiquetas.ts'

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

test('clase: códigos del estándar que no estaban en la tabla corta', () => {
  assert.equal(etiquetaClaseRecibo('EX'), 'Extorno')
  assert.equal(etiquetaClaseRecibo('pb'), 'Participación en beneficios')
})
test('rotuloClave: clase de comisión ME traducida; fuera de tabla crudo y marcado', () => {
  assert.deepEqual(rotuloClave('claseComision', 'ME'), { texto: 'Mediador: Comisión por producto', desconocido: false })
  assert.deepEqual(rotuloClave('claseComision', 'ZZ'), { texto: 'ZZ', desconocido: true })
  assert.equal(rotuloClave('claseComision', null), null)
  assert.equal(rotuloClave('claseComision', '  '), null)
})
test('conteoPlural: 1 cobrado, 2 cobrados', () => {
  assert.equal(conteoPlural(1, 'cobrado', 'cobrados'), '1 cobrado')
  assert.equal(conteoPlural(2, 'cobrado', 'cobrados'), '2 cobrados')
  assert.equal(conteoPlural(0, 'devuelto', 'devueltos'), '0 devueltos')
})
