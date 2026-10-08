import test from 'node:test'
import assert from 'node:assert/strict'
import { resumenError, textoMotivoGoogle, urlConectarValida } from './google-contactos-conexion.ts'

const BUENA = 'https://central-asegura.vercel.app/api/google-contactos/conectar?ticket=abc.def'

test('la URL de conectar que devuelve asegura se acepta tal cual', () => {
  assert.equal(urlConectarValida(BUENA), BUENA)
  assert.equal(urlConectarValida('http://localhost:3001/api/google-contactos/conectar?ticket=x'), 'http://localhost:3001/api/google-contactos/conectar?ticket=x')
})

test('🪤 nada que no sea exactamente «conectar con ticket» por https: no se navega', () => {
  for (const v of [
    'http://central-asegura.vercel.app/api/google-contactos/conectar?ticket=x',
    'javascript:alert(1)',
    'https://central-asegura.vercel.app/api/otra?ticket=x',
    'https://central-asegura.vercel.app/api/google-contactos/conectar',
    'https://central-asegura.vercel.app/api/google-contactos/conectar?ticket=',
    'https://central-asegura.vercel.app/api/google-contactos/conectar?ticket=x&next=https://malo',
    'https://u:p@central-asegura.vercel.app/api/google-contactos/conectar?ticket=x',
    'https://central-asegura.vercel.app/api/google-contactos/conectar?ticket=x#y',
    '/api/google-contactos/conectar?ticket=x', '', null, 42, undefined,
  ]) assert.equal(urlConectarValida(v), null, String(v))
})

test('cada motivo del callback tiene su texto; uno desconocido, el genérico', () => {
  assert.match(textoMotivoGoogle('ticket_usado'), /ya se había usado/)
  assert.match(textoMotivoGoogle('ticket_caducado'), /caducó/)
  assert.match(textoMotivoGoogle('state_nonce'), /no se pudo verificar/)
  assert.match(textoMotivoGoogle('cuenta_no_permitida'), /no está autorizada/)
  assert.match(textoMotivoGoogle('<script>'), /No se ha podido conectar/)
  assert.match(textoMotivoGoogle(null), /No se ha podido conectar/)
})

test('🪤 el último error se resume, y sin error no se inventa uno', () => {
  assert.equal(resumenError(null), null)
  assert.equal(resumenError('   '), null)
  assert.equal(resumenError('invalid_grant'), 'invalid_grant')
  const largo = resumenError('x'.repeat(500))!
  assert.equal(largo.length, 140)
  assert.ok(largo.endsWith('…'))
})
