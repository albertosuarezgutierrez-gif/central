import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accionesCarta, leerCarta, leerCartaPorTramitar } from './carta-mediador-asegura.ts'

test('🪤 una carta ilegible o con estado desconocido es null (la lista se declara ilegible)', () => {
  assert.equal(leerCarta({ id: 'a', estado: 'otro', creadaAt: 'x' }), null)
  assert.equal(leerCarta({ estado: 'firmada', creadaAt: 'x' }), null)
  assert.equal(leerCarta({ id: 'a', estado: 'firmada', creadaAt: '2026-09-23' })?.estado, 'firmada')
})

test('🪤 sin firma no se ofrece «enviada»; solo una enviada se acepta o rechaza', () => {
  assert.deepEqual(accionesCarta('pendiente'), { enviar: false, resolver: false, desistir: true })
  assert.deepEqual(accionesCarta('firmada'), { enviar: true, resolver: false, desistir: true })
  assert.deepEqual(accionesCarta('enviada'), { enviar: false, resolver: true, desistir: true })
  assert.deepEqual(accionesCarta('aceptada'), { enviar: false, resolver: false, desistir: false })
})

test('🪤 «Hoy» solo acepta firmadas o enviadas con su póliza; una fila rara es null, no se esconde', () => {
  const ok = { id: 'c1', estado: 'firmada', polizaId: 'p1', firmadaAt: '2026-09-23T10:00:00Z', cliente: 'Ana', compania: null }
  assert.equal(leerCartaPorTramitar(ok)?.compania, null)
  assert.equal(leerCartaPorTramitar({ ...ok, estado: 'aceptada' }), null)
  assert.equal(leerCartaPorTramitar({ ...ok, polizaId: undefined }), null)
  assert.equal(leerCartaPorTramitar({ ...ok, firmadaAt: null }), null)
})

test('«en cola» tiene tres estados: sin el dato no se afirma que el correo espera el OK', () => {
  const ok = { id: 'c1', estado: 'firmada', polizaId: 'p1', firmadaAt: '2026-09-24T10:00:00Z' }
  assert.equal(leerCartaPorTramitar({ ...ok, enCola: true })?.enCola, true)
  assert.equal(leerCartaPorTramitar({ ...ok, enCola: false })?.enCola, false)
  assert.equal(leerCartaPorTramitar(ok)?.enCola, null)
})
