// Guardián de la cabecera (rediseño 30/09/2026: accesos a herramientas en vez de
// catálogo de ramos). Lee el fuente: la cabecera es cliente y no se monta aquí.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { HERRAMIENTAS } from './sitio.ts'

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8')
const CABECERA = leer('components/Cabecera.tsx')

test('cada herramienta de la cabecera lleva a algo que existe', () => {
  const portada = leer('app/page.tsx')
  for (const h of HERRAMIENTAS) {
    const ancla = h.href.match(/^\/#(.+)$/)
    if (ancla) {
      assert.match(portada, new RegExp(`id="${ancla[1]}"`), `${h.href}: la portada no tiene la sección #${ancla[1]}`)
    } else {
      const pagina = new URL(`../app${h.href}/page.tsx`, import.meta.url)
      assert.ok(existsSync(pagina), `${h.href}: no existe app${h.href}/page.tsx`)
    }
  }
})

// 🚨 SEO: la cabecera es el enlace que sale en TODAS las páginas. Si el panel se
// monta solo al abrirlo, Google deja de ver los enlaces a las páginas de ramo.
test('el panel de Seguros está siempre en el HTML (oculto, no desmontado)', () => {
  assert.match(CABECERA, /id="hdr-panel"[^>]*hidden=\{!abierto\}/, 'el panel debe ir con hidden={!abierto}')
  assert.doesNotMatch(CABECERA, /\{\s*abierto\s*&&/, 'el panel no puede montarse condicionalmente')
  assert.match(CABECERA, /NAV\.filter\(\(n\) => n\.href\.startsWith\('\/seguros\/'\)\)/, 'el panel debe listar TODOS los ramos de NAV')
})

test('«Mis seguros» conserva origen="cabecera" (serie histórica del embudo del portal)', () => {
  assert.match(CABECERA, /href=\{PORTAL_URL\} origen="cabecera"/)
})

// Un fixed no desborda: se pone ENCIMA. La fila de chips hace más alta la
// cabecera en móvil, así que el hueco reservado tiene que crecer igual.
test('en móvil el hueco de la cabecera incluye la fila de chips', () => {
  const css = leer('app/globals.css')
  for (const sel of ['.pagina', '.hero']) {
    const re = new RegExp(`@media \\(max-width: 1023px\\) \\{\\s*\\${sel} \\{\\s*padding-top: calc\\(4\\.75rem \\+ 3\\.25rem`)
    assert.match(css, re, `${sel} no reserva el alto de los chips en móvil`)
  }
})
