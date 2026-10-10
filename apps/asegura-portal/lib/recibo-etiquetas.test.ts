import test from 'node:test'
import assert from 'node:assert/strict'
import { etiquetaClaseRecibo, textoSituacionConFecha } from './recibo-etiquetas.ts'

test('clase: conocidos, desconocido crudo, NULL → null', () => {
  assert.equal(etiquetaClaseRecibo('CA'), 'Renovación')
  assert.equal(etiquetaClaseRecibo('NP'), 'Nueva contratación')
  assert.equal(etiquetaClaseRecibo('SU'), 'Suplemento')
  assert.equal(etiquetaClaseRecibo('ZZ'), 'ZZ')
  assert.equal(etiquetaClaseRecibo(null), null)
  assert.equal(etiquetaClaseRecibo(' '), null)
})
test('situación con fecha solo para cobrado/devuelto/anulado', () => {
  assert.equal(textoSituacionConFecha('cobrado', '05/03/2026'), 'Cobrado el 05/03/2026')
  assert.equal(textoSituacionConFecha('Devuelto', '05/03/2026'), 'Devuelto el 05/03/2026')
  assert.equal(textoSituacionConFecha('cobrado', null), null)
  assert.equal(textoSituacionConFecha('pendiente', '05/03/2026'), null)
})
