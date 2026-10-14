import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 14/10/2026: al final del triaje se reevalúan las emisiones «aún no llegadas por CIMA», solo en vivo y sin romper la pasada.
const triaje = readFileSync(new URL('./triaje.ts', import.meta.url), 'utf8')
const puerto = readFileSync(new URL('../correduria-puerto.ts', import.meta.url), 'utf8')

test('triaje: reevalúa al final, solo si no es dry run, dentro de try/catch', () => {
  const i = triaje.indexOf('reevaluarEventosCorreoAsegura()')
  assert.ok(i > triaje.indexOf('await sesion.cerrar()'))
  const bloque = triaje.slice(triaje.lastIndexOf('if (!DRY_RUN())', i), i + 400)
  assert.match(bloque, /try \{/)
  assert.match(bloque, /catch \(e\)/)
})

test('puerto: llama a /reevaluar y nunca lanza', () => {
  const fn = puerto.slice(puerto.indexOf('export async function reevaluarEventosCorreoAsegura'))
  assert.match(fn, /pedirPost\('\/api\/operador\/correo\/evento\/reevaluar'/)
  assert.match(fn.slice(0, 700), /catch \{\s*return null/)
})
