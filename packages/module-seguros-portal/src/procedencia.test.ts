import test from 'node:test'
import assert from 'node:assert/strict'
import { fiabilidad, etiquetaProcedencia, sePuedeAfirmar, PROCEDENCIAS } from './procedencia.ts'

test('las tres procedencias son exactamente esas, y no hay una cuarta de cajón', () => {
  assert.deepEqual([...PROCEDENCIAS], ['compania', 'calculado', 'declarado'])
})

test('solo el dato de la compañía se puede afirmar sin confirmar', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'compania', confirmadoPorUsuario: false }), true)
})

test('un dato CALCULADO no se afirma hasta que el usuario lo confirma', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'calculado', confirmadoPorUsuario: false }), false)
  assert.equal(sePuedeAfirmar({ procedencia: 'calculado', confirmadoPorUsuario: true }), true)
})

test('un dato DECLARADO nunca se presenta como verificado, ni confirmado', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'declarado', confirmadoPorUsuario: true }), false)
})

test('la fiabilidad ordena: compania > calculado > declarado', () => {
  assert.ok(fiabilidad('compania') > fiabilidad('calculado'))
  assert.ok(fiabilidad('calculado') > fiabilidad('declarado'))
})

test('cada procedencia tiene una etiqueta que el usuario entiende', () => {
  assert.equal(etiquetaProcedencia('compania'), 'Confirmado por la compañía')
  assert.equal(etiquetaProcedencia('calculado'), 'Calculado — confírmalo')
  assert.equal(etiquetaProcedencia('declarado'), 'Lo has indicado tú')
})
