import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retarificabilidad, numeroPositivo, anioPlausible, cpValido } from './retarificable.ts'

const HOGAR = { cp: '41002', metrosCuadrados: '76', anioConstruccion: '1994', localidad: 'SEVILLA' }

test('auto: con matrícula sí, sin matrícula no, y la gemela vale', () => {
  assert.equal(retarificabilidad({ tipo: 'auto', datos: { matricula: '0000XXX' } }).retarificable, true)
  const sin = retarificabilidad({ tipo: 'auto', datos: { marca: 'X' } })
  assert.equal(sin.retarificable, false)
  assert.match(sin.motivo ?? '', /matrícula/)
  const gem = retarificabilidad({ tipo: 'auto', datos: null, datosGemela: { matricula: '0000XXX' } })
  assert.deepEqual(gem, { ramo: 'auto', retarificable: true, motivo: null, fuente: 'gemela' })
})

test('hogar: CIMA sin objeto + gemela con m²/año/CP → retarificable por la gemela', () => {
  const r = retarificabilidad({ tipo: 'hogar', datos: null, datosGemela: HOGAR })
  assert.deepEqual(r, { ramo: 'hogar', retarificable: true, motivo: null, fuente: 'gemela' })
  const propia = retarificabilidad({ tipo: 'hogar', datos: HOGAR })
  assert.equal(propia.fuente, 'poliza')
})

test('🚨 hogar sin datos del riesgo NO se retarifica, y el motivo dice QUÉ falta', () => {
  const r = retarificabilidad({ tipo: 'hogar', datos: { localidad: 'ROTA' }, datosGemela: { cp: '11520' } })
  assert.equal(r.retarificable, false)
  assert.equal(r.ramo, null)
  // El CP lo trae la gemela → no cuenta como faltante; m² y año faltan en las dos.
  assert.match(r.motivo ?? '', /m²/)
  assert.match(r.motivo ?? '', /año de construcción/)
  assert.doesNotMatch(r.motivo ?? '', /CP\b/)
})

test('cancelada nunca; otros ramos dicen cuál es', () => {
  assert.match(retarificabilidad({ tipo: 'auto', estado: 'cancelada', datos: { matricula: 'X' } }).motivo ?? '', /cancelada/)
  const vida = retarificabilidad({ tipo: 'vida', datos: null })
  assert.equal(vida.retarificable, false)
  assert.match(vida.motivo ?? '', /esta es de vida/)
})

test('los números del volcado vienen como texto y se aceptan; la basura no', () => {
  assert.equal(numeroPositivo('76'), 76)
  assert.equal(numeroPositivo('76,5'), 76.5)
  assert.equal(numeroPositivo('0'), null)
  assert.equal(numeroPositivo(''), null)
  assert.equal(anioPlausible('1994'), 1994)
  assert.equal(anioPlausible('194'), null)
  assert.equal(anioPlausible('1994.5'), null)
  assert.equal(cpValido(' 41002 '), '41002')
  assert.equal(cpValido('4100'), null)
})
