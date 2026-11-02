// Guardián del relé `POST /api/operador/codeoscopic/product-form` de asegura (02/11/2026).
// Era un relé genérico: cualquier método y cualquier `path` hacia `POST /product-form-requests`,
// fuera del interruptor. Ahora: GET/POST, ruta limpia, nunca raíces que cotizan o emiten, y
// detrás del interruptor de EMISIÓN como `/oferta` y `/coberturas`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validarProductForm } from '../apps/asegura/app/api/operador/codeoscopic/product-form/validar.ts'

const RAIZ = join(import.meta.dirname, '..')
const RUTA = join(RAIZ, 'apps', 'asegura', 'app', 'api', 'operador', 'codeoscopic', 'product-form', 'route.ts')

test('product-form: el caso documentado pasa (GET por defecto)', () => {
  assert.deepEqual(validarProductForm({ method: undefined, path: '/places/provinces' }), { ok: true, metodo: 'GET', path: '/places/provinces' })
  assert.equal(validarProductForm({ method: 'post', path: '/vendors/allianz/forms/consent' }).ok, true)
})

test('product-form: solo GET y POST', () => {
  for (const m of ['PUT', 'DELETE', 'PATCH', 'HEAD', 42, '']) {
    assert.equal(validarProductForm({ method: m, path: '/places/provinces' }).ok, false, String(m))
  }
})

test('product-form: nunca raíces que cotizan, emiten o dan credenciales', () => {
  for (const p of ['/insurances', '/insurances/abc/offers', '/Insurances', '/insurance-drafts', '/policy-applications/x', '/oauth2/token', '/app-auth-tokens', '/product-form-requests']) {
    assert.equal(validarProductForm({ method: 'POST', path: p }).ok, false, p)
  }
})

test('product-form: ruta relativa limpia (sin host, query, .., //, codificados)', () => {
  for (const p of ['', 'places', 'https://evil/x', '//evil/x', '/places/../insurances', '/a/./b', '/places?x=1', '/places#f', '/%69nsurances', '/a//b', '/a b']) {
    assert.equal(validarProductForm({ method: 'GET', path: p }).ok, false, p)
  }
})

test('product-form: la ruta usa la validación y el interruptor de emisión, no la vía gratis', () => {
  const src = readFileSync(RUTA, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  assert.match(src, /validarProductForm\(/)
  assert.match(src, /resolverConfigEmision\(\)/)
  assert.doesNotMatch(src, /ignorarInterruptor/)
  assert.doesNotMatch(src, /'PUT'|'DELETE'|'PATCH'/)
})
