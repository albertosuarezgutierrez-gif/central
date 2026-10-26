import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AVISO_ENLACE_RENOVADO, resultadoPedirDatos } from './pedir-datos.ts'

// 26/10/2026 (Alberto aprueba): «Pedir datos por enlace» renueva el enlace vivo en vez de obligar a anularlo.
test('nuevo (201): enlace y mensaje, sin aviso de renovado', () => {
  const r = resultadoPedirDatos(201, { estado: 'ok', nueva: true, url: 'https://p/datos/t', mensaje: 'Hola https://p/datos/t', caduca: '2026-11-09T06:05:29Z' })
  assert.deepEqual(r, { ok: true, url: 'https://p/datos/t', mensaje: 'Hola https://p/datos/t', caduca: '2026-11-09T06:05:29Z', renovado: false, aviso: null })
})

test('había uno vivo (200 reemitida): enlace nuevo y «Enlace renovado; el anterior ya no funciona»', () => {
  const r = resultadoPedirDatos(200, { estado: 'ok', nueva: false, reemitida: true, url: 'https://p/datos/t2', mensaje: 'm', caduca: '2026-11-09T06:05:29Z' })
  assert.ok(r.ok && r.renovado)
  assert.equal(r.ok && r.aviso, AVISO_ENLACE_RENOVADO)
  assert.match(AVISO_ENLACE_RENOVADO, /^Enlace renovado; el anterior ya no funciona/)
})

test('sin url: fallo con motivo, nunca «anúlalo y crea otro»', () => {
  for (const [s, j] of [[200, { estado: 'ok', url: null }], [409, { motivo: 'La oportunidad está ganada.' }], [0, null]] as const) {
    const r = resultadoPedirDatos(s, j as Record<string, unknown> | null)
    assert.equal(r.ok, false)
    assert.match(r.ok ? '' : r.aviso, /^No se ha podido generar el enlace: /)
    assert.doesNotMatch(r.ok ? '' : r.aviso, /anúlalo/i)
  }
})

test('la pantalla pide el enlace con `reemitir: true`, ofrece renovar con uno vivo y conserva «Anular enlace»', () => {
  const src = readFileSync(new URL('../../app/(usuario)/correduria/cliente/[id]/PedirDatos.tsx', import.meta.url), 'utf8')
  assert.match(src, /post\(\{ oportunidadId, reemitir: true \}\)/)
  assert.match(src, /resultadoPedirDatos\(/)
  assert.doesNotMatch(src, /anúlalo y crea otro/)
  assert.match(src, /'Renovar enlace'/)
  assert.match(src, />Anular enlace</)
})
