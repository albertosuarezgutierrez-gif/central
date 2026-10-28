import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consultaGmail, filtrarNoProcesados, fusionarProcesados, MAX_PROCESADOS, VENTANA_CRON } from './inversion-correos-puro.ts'

test('filtrarNoProcesados: salta los ya vistos y los repetidos, conserva orden', () => {
  assert.deepEqual(filtrarNoProcesados(['a', 'b', 'b', 'c', ''], ['a']), ['b', 'c'])
  assert.deepEqual(filtrarNoProcesados(['a'], ['a']), [])
  assert.deepEqual(filtrarNoProcesados([], ['a']), [])
})

test('fusionarProcesados: sin duplicados y recorta a los más recientes', () => {
  assert.deepEqual(fusionarProcesados(['a', 'b'], ['b', 'c']), ['a', 'b', 'c'])
  const previos = Array.from({ length: MAX_PROCESADOS }, (_, i) => `m${i}`)
  const r = fusionarProcesados(previos, ['n1', 'n2'])
  assert.equal(r.length, MAX_PROCESADOS)
  assert.equal(r[r.length - 1], 'n2')
  assert.ok(!r.includes('m0') && !r.includes('m1') && r.includes('m2'))
})

test('consultaGmail: etiqueta + ventana', () => {
  assert.equal(consultaGmail('inmobiliaria', VENTANA_CRON), 'label:inmobiliaria newer_than:2d')
  assert.equal(consultaGmail('inmobiliaria', 'after:2026/10/01'), 'label:inmobiliaria after:2026/10/01')
})
