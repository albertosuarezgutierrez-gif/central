import { test } from 'node:test'
import assert from 'node:assert'
import { elegirCodigoAbrir, normalizarAcceso, DP_ABRIR } from './acceso-puro.ts'

test('elegirCodigoAbrir prefiere el primer candidato presente', () => {
  assert.equal(elegirCodigoAbrir(['unlock_request', 'switch']), 'unlock_request')
  assert.equal(elegirCodigoAbrir(['open_door']), 'open_door')
  assert.equal(elegirCodigoAbrir(['switch_led']), null)
})

test('DP_ABRIR incluye los candidatos habituales de control de acceso', () => {
  for (const c of ['unlock_request', 'open_door', 'manual_lock', 'remote_no_dp_key']) {
    assert.ok(DP_ABRIR.includes(c as (typeof DP_ABRIR)[number]), `${c} debería estar en DP_ABRIR`)
  }
})

test('normalizarAcceso resume un resultado ok y uno con error', () => {
  assert.deepEqual(normalizarAcceso('pins', { ok: true, result: [1, 2] }),
    { clave: 'pins', ok: true, datos: [1, 2], error: null })
  assert.deepEqual(normalizarAcceso('pins', { ok: false, msg: 'permission deny' }),
    { clave: 'pins', ok: false, datos: null, error: 'permission deny' })
})
