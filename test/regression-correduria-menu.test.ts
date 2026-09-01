import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Guardián del acceso a la Correduría (31/08/2026): /correduria existía desde el
// 22/06/2026 pero NUNCA estuvo en el menú — solo se llegaba por los enlaces de las
// tarjetas de /banca. Alberto, con el menú abierto: «no me sale correduría». Una
// sección sin entrada en el sidebar es una sección invisible para quien no pasa por
// Inicio, y ni tsc ni el build cazan eso: se vigila leyendo el FUENTE.

const SIDEBAR = join(import.meta.dirname, '..', 'apps/plataforma/app/(usuario)/UserSidebar.tsx')

test('el menú «Mi negocio» enlaza a /correduria', () => {
  const fuente = readFileSync(SIDEBAR, 'utf8')
  const navNegocio = fuente.match(/const NAV_NEGOCIO = \[([\s\S]*?)\n\]/)
  assert.ok(navNegocio, 'no se encontró NAV_NEGOCIO en UserSidebar.tsx')
  assert.match(navNegocio![1], /href: ['"]\/correduria['"]/,
    'la Correduría no está en NAV_NEGOCIO: la sección queda sin acceso desde el menú')
})

test('la página a la que apunta el menú existe', () => {
  const pagina = join(import.meta.dirname, '..', 'apps/plataforma/app/(usuario)/correduria/page.tsx')
  assert.doesNotThrow(() => readFileSync(pagina, 'utf8'),
    'el menú enlaza a /correduria pero la página no existe')
})
