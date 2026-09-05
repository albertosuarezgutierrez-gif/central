// Guardián del origen público.
//
// El 05/09/2026 la web salió a producción en `grupoasegura.es` mientras el
// código llevaba `grupoasegura.com` como origen por defecto — un apex que apunta
// a un parking de IONOS. Consecuencia: cada página declaraba canónica una URL
// que no carga y el sitemap listaba un dominio vacío. Ni tsc ni next build lo
// ven: es una cadena. Este test fija el apex real y prohíbe el `.com`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SITIO_URL, PORTAL_URL } from './sitio.ts'

test('el origen por defecto es el apex donde la web sirve (.es), no el .com aparcado', () => {
  if (process.env.NEXT_PUBLIC_SITIO_URL) return // en Vercel manda la env; aquí se prueba el defecto
  assert.equal(SITIO_URL, 'https://grupoasegura.es')
})

test('ningún origen apunta al .com', () => {
  for (const u of [SITIO_URL, PORTAL_URL]) {
    assert.doesNotMatch(u, /grupoasegura\.com/, `${u}: el .com es un parking de IONOS, no sirve nada`)
  }
})
