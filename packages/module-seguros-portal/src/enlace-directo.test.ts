import test from 'node:test'
import assert from 'node:assert/strict'

import { destinoSeguro, estadoEnlace, generarTokenEnlace, hashTokenEnlace, tokenEnlaceValido, urlEnlaceDirecto } from './enlace-directo.ts'

test('el token es largo, aleatorio y con forma fija; se guarda solo su hash', async () => {
  const a = generarTokenEnlace()
  assert.ok(tokenEnlaceValido(a))
  assert.notEqual(a, generarTokenEnlace())
  assert.match(await hashTokenEnlace(a), /^[0-9a-f]{64}$/)
  // SHA-256 de «abc», vector de prueba conocido: el hash es el estándar, no uno casero.
  assert.equal(await hashTokenEnlace('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(tokenEnlaceValido('123456'), false, 'un código de 6 dígitos no es una llave de enlace')
})

test('🚨 un solo uso y con caducidad', () => {
  const ahora = new Date('2026-09-24T10:00:00Z')
  assert.equal(estadoEnlace({ usadoEn: null, expiraAt: new Date('2026-09-25T10:00:00Z') }, ahora), 'valido')
  assert.equal(estadoEnlace({ usadoEn: new Date('2026-09-24T09:00:00Z'), expiraAt: new Date('2026-09-25T10:00:00Z') }, ahora), 'usado')
  assert.equal(estadoEnlace({ usadoEn: null, expiraAt: ahora }, ahora), 'caducado')
})

test('🚨 tras entrar solo se va a una ruta del portal: nunca un redirector a otro sitio', () => {
  assert.equal(destinoSeguro('/boveda?vista=datos'), '/boveda?vista=datos')
  assert.equal(destinoSeguro('//malo.com/x'), '/boveda')
  assert.equal(destinoSeguro('https://malo.com'), '/boveda')
  assert.equal(destinoSeguro('/\\malo.com'), '/boveda')
  assert.equal(destinoSeguro(null), '/boveda')
})

test('la URL es https, lleva correo, token y destino, y nada más', () => {
  const u = new URL(urlEnlaceDirecto('https://clientes.grupoasegura.es/?x=1', 'a@b.es', 'T'.repeat(43), '/autorizaciones'))
  assert.equal(u.origin + u.pathname, 'https://clientes.grupoasegura.es/')
  assert.deepEqual([...u.searchParams.keys()], ['d', 'e', 'r'])
  assert.throws(() => urlEnlaceDirecto('http://x.es', 'a@b.es', 't', '/'), /enlace_no_https/)
})
