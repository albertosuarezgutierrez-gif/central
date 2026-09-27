import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { IMAGEN_TARJETA } from './tarjeta.ts'

// Guardián de la tarjeta de compartir: toda página con documento HTML propio lleva
// `og:image` (en línea o vía `${TARJETA}`), y la portada —que reescribe el agente SEO—
// apunta a la MISMA imagen que `tarjeta.ts`. Ver la cabecera de `tarjeta.ts`.

const APP = fileURLToPath(new URL('.', import.meta.url))
const PAGINAS = readdirSync(APP, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
  .map((f) => ({ fichero: f, texto: readFileSync(new URL(f, import.meta.url), 'utf8') }))
  .filter(({ texto }) => texto.includes('<!DOCTYPE html>'))

test('toda página lleva imagen al compartirla', () => {
  assert.ok(PAGINAS.length >= 4, `solo ${PAGINAS.length} páginas: el recorrido no mira donde debe`)
  const sin = PAGINAS.filter(({ texto }) => !texto.includes('og:image') && !texto.includes('${TARJETA}'))
  assert.deepEqual(sin.map((p) => p.fichero), [])
})

test('la portada usa la misma imagen que tarjeta.ts', () => {
  const portada = readFileSync(new URL('route.ts', import.meta.url), 'utf8')
  const og = portada.match(/<meta property="og:image" content="([^"]*)"/)
  assert.equal(og?.[1], IMAGEN_TARJETA)
})
