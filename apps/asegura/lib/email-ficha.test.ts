import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MEDIADOR } from '@central/module-seguros'
import { elegirEmailGuardado as elegir } from './email-ficha-reglas.ts'

const ILEGIBLE_MARCA = 'v1:'
const io = {
  campoIlegible: (v: string) => v.startsWith(ILEGIBLE_MARCA),
  descifrarCampo: (v: string) => (v.startsWith(ILEGIBLE_MARCA) ? null : v),
}
const elegirEmailGuardado = (g: string[]) => elegir(g, io)

const CANAL = MEDIADOR.identidad.email
const ILEGIBLE = 'v1:no-se-puede-abrir'

test('un email propio gana al canal de la correduría', () => {
  assert.deepEqual(elegirEmailGuardado([CANAL, 'ana@example.com']), { estado: 'ok', email: 'ana@example.com' })
})

test('solo el canal → sin_email', () => {
  assert.deepEqual(elegirEmailGuardado([CANAL]), { estado: 'sin_email' })
})

test('canal + uno ilegible → ilegible (el canal no tapa un problema de clave)', () => {
  assert.deepEqual(elegirEmailGuardado([CANAL, ILEGIBLE]), { estado: 'ilegible' })
  assert.deepEqual(elegirEmailGuardado([ILEGIBLE, CANAL]), { estado: 'ilegible' })
})

test('solo ilegibles → ilegible', () => {
  assert.deepEqual(elegirEmailGuardado([ILEGIBLE]), { estado: 'ilegible' })
})
