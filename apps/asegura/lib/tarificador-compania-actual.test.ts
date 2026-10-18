// `node --test`. Nombres de compañía FICTICIOS; sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarCompaniaActual, companiaActualDeCliente, nombreCompaniaUtil, type PolizaParaCompaniaActual } from './tarificador-compania-actual.ts'

const p = (x: Partial<PolizaParaCompaniaActual>): PolizaParaCompaniaActual => ({
  tipo: 'auto', aseguradora: 'Aseguradora Uno', estado: 'activa', importRef: null, eiacXmlHash: null, sustituidaAt: null, fechaEfecto: '2026-01-01', ...x,
})

test('la compañía de la oportunidad (póliza de la competencia) manda sobre la cartera', () => {
  assert.equal(companiaActualDeCliente({ aseguradora: 'Aseguradora Beta' }, [p({})]), 'Aseguradora Beta')
})
test('sin competencia: la póliza de auto en vigor más reciente', () => {
  const r = companiaActualDeCliente(null, [p({ aseguradora: 'Vieja', fechaEfecto: '2020-01-01' }), p({ aseguradora: 'Nueva', fechaEfecto: '2025-05-05' })])
  assert.equal(r, 'Nueva')
})
test('no cuentan: no auto, cancelada, volcado histórico, sustituida ni nombre de cajón', () => {
  const todas = [
    p({ tipo: 'hogar' }), p({ estado: 'cancelada' }), p({ importRef: 'volcado-1' }), p({ sustituidaAt: '2026-02-02' }), p({ aseguradora: 'otro' }),
  ]
  assert.equal(companiaActualDeCliente(null, todas), null)
  assert.equal(companiaActualDeCliente(null, null), null)
  assert.equal(companiaActualDeCliente({ aseguradora: 'N/A' }, []), null)
})
test('compania_declarada solo si aseguradora no sirve', () => {
  assert.equal(companiaActualDeCliente(null, [p({ aseguradora: '', companiaDeclarada: 'Declarada SA' })]), 'Declarada SA')
})
test('nombreCompaniaUtil: vacío, cajón y no-string → null', () => {
  for (const v of ['', '  ', 'Otro', 'n/a', null, 7, undefined]) assert.equal(nombreCompaniaUtil(v), null)
  assert.equal(nombreCompaniaUtil('  Aseguradora   Gamma '), 'Aseguradora Gamma')
})
test('aplicarCompaniaActual rellena solo si falta y solo Allianz auto', () => {
  const r = { ramo: 'auto', matricula: 'X' }
  assert.deepEqual(aplicarCompaniaActual('allianz', 'auto', r, 'Beta'), { ...r, companiaActual: 'Beta' })
  assert.equal(aplicarCompaniaActual('allianz', 'auto', r, null), r)
  assert.equal(aplicarCompaniaActual('allianz', 'moto', r, 'Beta'), r)
  assert.equal(aplicarCompaniaActual('mapfre', 'auto', r, 'Beta'), r)
  const conAnterior = { ...r, companiaAnterior: 'Ya' }
  assert.equal(aplicarCompaniaActual('allianz', 'auto', conAnterior, 'Beta'), conAnterior)
  const conActual = { ...r, companiaActual: 'Ya' }
  assert.equal(aplicarCompaniaActual('allianz', 'auto', conActual, 'Beta'), conActual)
  assert.deepEqual(aplicarCompaniaActual('allianz', 'auto', { ...r, companiaActual: ' ' }, 'Beta'), { ...r, companiaActual: 'Beta' })
  assert.equal(aplicarCompaniaActual('allianz', 'auto', 'no-objeto', 'Beta'), 'no-objeto')
})
