// Guardián de la instalación de la intranet como app (24/09/2026). Todas las formas de romperlo son
// MUDAS: no falla el build ni el typecheck; el botón «Instalar» simplemente deja de aparecer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

test('el manifiesto declara lo que Chrome exige para ofrecer instalar', () => {
  const f = leer('app/manifest.ts')
  assert.match(f, /display:\s*'standalone'/)
  assert.match(f, /start_url:\s*'\/inicio'/, 'la app instalada tiene que abrir en el Inicio, sin saltos')
  const tamanos = [...f.matchAll(/sizes:\s*'(\d+)x\d+'/g)].map(m => Number(m[1]))
  assert.ok(tamanos.length >= 2)
  for (const l of tamanos) assert.ok(l >= 192, `icono de ${l} px: por debajo de 192 Chrome no ofrece instalar`)
  assert.match(f, /purpose:\s*'maskable'/)
  assert.doesNotMatch(f, /(theme|background)_color:\s*'(var|oklch)/, 'los lanzadores de Android no entienden var()/oklch()')
})

test('el icono del manifiesto existe y el manifiesto viejo no vuelve', () => {
  assert.ok(existsSync(join(RAIZ, 'app/icono-app/route.tsx')))
  assert.ok(!existsSync(join(RAIZ, 'public/manifest.json')), 'dos manifiestos: el navegador cogería uno cualquiera')
})

test('el service worker existe, se registra y NO cachea nada (datos financieros)', () => {
  const sw = leer('public/sw.js')
  assert.match(sw, /addEventListener\('fetch'/, 'sin manejador de fetch Chrome no ofrece instalar')
  const codigo = sw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert.doesNotMatch(codigo, /caches\.|respondWith|cache\.put/, 'el SW no puede guardar respuestas en el dispositivo')
  assert.match(leer('app/layout.tsx'), /<RegistrarSW\s*\/>/)
})

test('el middleware deja pasar SIN sesión lo que el navegador pide para instalar', () => {
  const m = leer('middleware.ts').match(/matcher:\s*\[\s*'([^']+)'/)
  assert.ok(m, 'no se encontró el matcher del middleware')
  const re = new RegExp(`^${m[1].replace(/\\\\/g, '\\')}$`)
  for (const ruta of ['/manifest.webmanifest', '/sw.js', '/icono-app', '/icon.svg']) {
    assert.equal(re.test(ruta), false, `${ruta} pasa por el gate de sesión: Chrome lo pide sin cookie y la instalación muere en silencio`)
  }
  for (const ruta of ['/inicio', '/banca', '/api/banca/destino']) {
    assert.equal(re.test(ruta), true, `${ruta} dejó de pasar por el gate de sesión`)
  }
})
