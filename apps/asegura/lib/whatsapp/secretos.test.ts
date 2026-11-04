import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import { formaSecreto, recortarSecreto } from './forma-secreto.ts'

test('formaSecreto: espacios y salto de línea en los bordes', () => {
  assert.equal(formaSecreto(' abc123\n'), 'len=8 hex=true espacios_borde=true')
})

test('formaSecreto: 32 hex limpios', () => {
  assert.equal(formaSecreto('0123456789abcdef0123456789ABCDEF'), 'len=32 hex=true espacios_borde=false')
})

test('formaSecreto: ausente y no hex', () => {
  assert.equal(formaSecreto(null), 'ausente')
  assert.match(formaSecreto('zzz'), /hex=false/)
})

test('formaSecreto: la salida no contiene el valor', () => {
  const valor = 'deadbeefcafe1234'
  assert.ok(!formaSecreto(valor).includes(valor))
  assert.ok(!formaSecreto(valor).includes('deadbeef'))
})

test('recortarSecreto recorta espacios/saltos y vacío tras trim → null', () => {
  assert.equal(recortarSecreto('  abc123\n'), 'abc123')
  assert.equal(recortarSecreto(' \n '), null)
})

test('secretoWhatsapp pasa el valor por recortarSecreto (no devuelve el crudo)', () => {
  const src = readFileSync(new URL('./secretos.ts', import.meta.url), 'utf8')
  assert.match(src, /return recortarSecreto\(requireSecret\(nombre\)\)/)
})
