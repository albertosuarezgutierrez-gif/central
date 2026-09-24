import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Cepos del enlace de datos del cliente (24/09/2026). Leen el FUENTE: lo que vigilan vive
// dentro de `Prisma.sql`, donde ni tsc ni el build miran, y así no se arrastra Prisma.
const src = readFileSync(new URL('./solicitud-datos.ts', import.meta.url), 'utf8')

test('el token solo se guarda como huella, nunca en claro', () => {
  assert.match(src, /token_hash[\s\S]*\$\{hashToken\(token\)\}/, 'el insert guarda hashToken(token)')
  assert.doesNotMatch(src, /values \([^)]*\$\{token\}/, 'ningún insert lleva el token en claro')
  assert.match(src, /where token_hash = \$\{hashToken\(token\)\}/, 'se busca por la huella')
})

test('las respuestas se guardan cifradas y no se escriben en la ficha', () => {
  assert.match(src, /encryptField\(JSON\.stringify\(v\.respuestas\)\)/)
  assert.doesNotMatch(src, /update clientes/, 'lo declarado por el enlace no toca la ficha')
})

test('la vista pública por token no devuelve nada del cliente', () => {
  const publica = src.slice(src.indexOf('export async function solicitudPorToken'), src.indexOf('/** El cliente manda sus datos'))
  assert.match(publica, /\{ estado: 'ok', ramo, campos: f\.campos \}/)
  assert.doesNotMatch(publica, /cliente|nombre|dni|telefono|email/i)
})

test('completar solo vale una vez y dentro de plazo', () => {
  assert.match(src, /where id = \$\{f\.id\}::uuid and estado = 'pendiente' and caduca_at > now\(\)/)
})

test('una oportunidad ya cerrada no recibe datos: el enlace se anula antes de completar', () => {
  const r = src.slice(src.indexOf('export async function responderSolicitud'))
  const guarda = r.search(/o\.estado === 'ganada' \|\| o\.estado === 'perdida'/)
  const completar = r.indexOf("set estado = 'completada'")
  assert.ok(guarda > 0 && guarda < completar, 'la guarda de cerrada va antes de marcar completada')
})
