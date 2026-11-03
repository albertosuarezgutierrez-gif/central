// Explorador 0.3.27 (31/10/2026, Fidelidade Vivienda real): «POST … /OPI_ES_Vivienda/ClientData.aspx [ruta en la lista, pero con query: claves
// _ts]». `_ts` es un cache-buster: la ruta EXACTA de la lista casa con una query cuyo ÚNICO parámetro es `_ts` de solo cifras. Nada más se abre.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { destinoAvancePermitido, esQuerySoloCacheBuster } from '../src/guard.ts'

const CD = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/ClientData.aspx'
const SIM = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx'

test('0.3.27 · ruta de la lista con `?_ts=<cifras>` como único parámetro pasa', () => {
  assert.equal(destinoAvancePermitido(`${CD}?_ts=123`, [CD]), true)
  assert.equal(destinoAvancePermitido(`${CD}?_ts=1761900000000`, [SIM, CD]), true)
})

test('0.3.27 · `_ts` no numérico, vacío, repetido o acompañado sigue bloqueado', () => {
  for (const q of ['?_ts=abc', '?_ts=', '?_ts', '?_ts=1&x=2', '?x=2&_ts=1', '?_ts=1&_ts=2', '?x=1', '?_ts=1e3', '?_ts=-1', '?_ts=%31', '?_TS=1', '?_ts=12345678901234567890', '?_ts=1#f'])
    assert.equal(destinoAvancePermitido(`${CD}${q}`, [CD]), false, q)
})

test('0.3.27 · otra ruta (fuera de la lista) con `?_ts=1` sigue bloqueada; credenciales también', () => {
  assert.equal(destinoAvancePermitido('https://mediadores.fidelidade.es/OPI_ES_Vivienda/Otra.aspx?_ts=1', [CD]), false)
  assert.equal(destinoAvancePermitido('https://otro.example/OPI_ES_Vivienda/ClientData.aspx?_ts=1', [CD]), false)
  assert.equal(destinoAvancePermitido('https://u:p@mediadores.fidelidade.es/OPI_ES_Vivienda/ClientData.aspx?_ts=1', [CD]), false)
})

test('0.3.27 · esQuerySoloCacheBuster es estricta', () => {
  assert.equal(esQuerySoloCacheBuster('?_ts=9'), true)
  for (const s of ['', '?', '?_ts=a', '?_ts=1&a=b', '?a=1']) assert.equal(esQuerySoloCacheBuster(s), false, s)
})
