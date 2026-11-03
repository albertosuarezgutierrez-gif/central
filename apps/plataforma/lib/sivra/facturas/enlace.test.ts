import { test } from 'node:test'
import assert from 'node:assert'
import { conEnlace, generarToken, lineaEnlace, tokenConForma, urlFormulario } from './enlace.ts'

test('token aleatorio de 43 caracteres base64url, distinto cada vez', () => {
  const a = generarToken(), b = generarToken()
  assert.ok(tokenConForma(a) && tokenConForma(b))
  assert.notEqual(a, b)
  for (const x of ['', 'corto', `${a}x`, `${a.slice(0, 42)}/`, null, 42]) assert.equal(tokenConForma(x), false)
})

test('URL y línea en el idioma del huésped; el enlace se añade una sola vez', () => {
  const url = urlFormulario('T'.repeat(43), 'https://x.test/')
  assert.equal(url, `https://x.test/factura/${'T'.repeat(43)}`)
  assert.match(lineaEnlace('it', url), /^Puoi inserire/)
  assert.match(lineaEnlace('xx', url), /^You can fill/)
  const r = conEnlace('Hola Ana, claro que sí.', 'es', url)
  assert.equal(r, `Hola Ana, claro que sí.\n\nPuedes rellenar tus datos de facturación aquí: ${url}`)
  assert.equal(conEnlace(r, 'es', url), r)
  assert.equal(conEnlace('', 'es', url), '')
})
