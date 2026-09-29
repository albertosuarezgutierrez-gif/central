import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conMarcaCorreo, LOGO_CORREO_URL, PIE_MARCA_CORREO } from './correo-marca.ts'

test('envuelve con el logotipo y el pie que nombra el dominio', () => {
  const h = conMarcaCorreo('<p>Hola</p>')
  assert.ok(h.includes(`<img src="${LOGO_CORREO_URL}"`))
  assert.ok(h.includes('alt="Grupo ASegura"'))
  assert.ok(h.includes('<p>Hola</p>'))
  assert.ok(h.includes(PIE_MARCA_CORREO))
  assert.match(PIE_MARCA_CORREO, /@grupoasegura\.es/)
})

test('no duplica la cabecera en correos que ya traen el logo', () => {
  const propio = `<div><img src="${LOGO_CORREO_URL}">x</div>`
  assert.equal(conMarcaCorreo(propio), propio)
  const una = conMarcaCorreo('<p>x</p>')
  assert.equal(conMarcaCorreo(una), una)
})
