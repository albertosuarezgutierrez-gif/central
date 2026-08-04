import test from 'node:test'
import assert from 'node:assert/strict'
import { esErrorDeTimeout, veredictoSonda } from './sonda-veredicto.ts'

const TIMEOUT = 30_000
const base = { proveedor: 'nim', modelo: 'meta/llama-3.3-70b-instruct' }
const traficoVivo = { exitos: 40, p50Ms: 24_568, ventanaHoras: 48 }

test('esErrorDeTimeout distingue timeout/abort de errores HTTP', () => {
  assert.equal(esErrorDeTimeout('TimeoutError: The operation was aborted due to timeout'), true)
  assert.equal(esErrorDeTimeout('AbortError: aborted'), true)
  assert.equal(esErrorDeTimeout('Error: NVIDIA HTTP 429: quota exceeded'), false)
  assert.equal(esErrorDeTimeout(undefined), false)
})

test('respuesta a la primera → ok, sin línea', () => {
  const v = veredictoSonda({ ...base, ok: true, ms: 2_000 }, traficoVivo, TIMEOUT)
  assert.equal(v.nivel, 'ok')
  assert.equal(v.linea, '')
})

test('respondió al reintento → degradado 🟠, no «revisar key»', () => {
  const v = veredictoSonda({ ...base, ok: true, ms: 25_000, reintentos: 1 }, undefined, TIMEOUT)
  assert.equal(v.nivel, 'degradado')
  assert.match(v.linea, /^🟠/)
  assert.match(v.linea, /2º intento/)
  assert.doesNotMatch(v.linea, /revisar key/)
})

// El caso fundacional del 04/08/2026: la sonda agotó el timeout mientras el tráfico real de la
// víspera completaba 40 llamadas con la misma key — eso es «lento», no «muerto».
test('timeout con tráfico real vivo → degradado 🟠 que dice que la key está viva', () => {
  const v = veredictoSonda(
    { ...base, ok: false, ms: 30_002, error: 'TimeoutError: The operation was aborted due to timeout', reintentos: 1 },
    traficoVivo,
    TIMEOUT,
  )
  assert.equal(v.nivel, 'degradado')
  assert.match(v.linea, /^🟠/)
  assert.match(v.linea, /tráfico REAL sí completa/)
  assert.match(v.linea, /40 éxitos en 48 h/)
  assert.match(v.linea, /mediana 25 s/)
  assert.doesNotMatch(v.linea, /NO responde/)
})

test('timeout SIN tráfico real → muerto 🔴 (nada desmiente la avería)', () => {
  const v = veredictoSonda(
    { ...base, ok: false, ms: 30_001, error: 'TimeoutError: The operation was aborted due to timeout' },
    { exitos: 0, p50Ms: null, ventanaHoras: 48 },
    TIMEOUT,
  )
  assert.equal(v.nivel, 'muerto')
  assert.match(v.linea, /^🔴/)
  assert.match(v.linea, /revisar key\/cuota/)
})

test('error HTTP determinista → muerto 🔴 aunque haya tráfico real', () => {
  const v = veredictoSonda(
    { ...base, ok: false, ms: 640, error: 'Error: NVIDIA HTTP 401: unauthorized' },
    traficoVivo,
    TIMEOUT,
  )
  assert.equal(v.nivel, 'muerto')
  assert.match(v.linea, /NVIDIA HTTP 401/)
})
