import test from 'node:test'
import assert from 'node:assert/strict'
import { esNumeroPolizaComodin } from './duplicados.ts'

test('esNumeroPolizaComodin: vacío, null y undefined son comodín', () => {
  for (const v of [null, undefined, '', '   ', '--', ' . / ']) assert.equal(esNumeroPolizaComodin(v), true, String(v))
})

test('esNumeroPolizaComodin: los textos de relleno, con cualquier forma', () => {
  for (const v of ['PENDIENTE', 'pendiente', 'No se', 'NO SABE', 'no-sabe', '0', '00', '1', 'S/N', 's.n.', 'sin número'.replace('ú', 'u'), 'SIN NUMERO', 'NOLOSE', 'No lo sé', '12345', '5', '05']) {
    assert.equal(esNumeroPolizaComodin(v), true, v)
  }
})

test('esNumeroPolizaComodin: un número real NO es comodín', () => {
  for (const v of ['236788463', 'ES-12', '10', '11', 'PENDIENTE123', 'A1']) assert.equal(esNumeroPolizaComodin(v), false, v)
})
