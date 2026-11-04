// Guardián de las páginas legales que exige Meta para la app de WhatsApp
// (condiciones del servicio e instrucciones de eliminación de datos).
// Si se pierden del sitemap o del pie, la revisión de la app falla en silencio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const RUTAS = ['/legal/condiciones', '/legal/eliminacion-datos']
const leer = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

test('las dos rutas legales de Meta existen y están en el sitemap', () => {
  const sitemap = leer('app/sitemap.ts')
  for (const r of RUTAS) {
    assert.ok(existsSync(new URL(`../app${r}/page.tsx`, import.meta.url)), `falta la página ${r}`)
    assert.ok(sitemap.includes(`url('${r}')`), `${r} no está en el sitemap`)
  }
})

test('el pie enlaza las dos rutas y privacidad enlaza la eliminación de datos', () => {
  const layout = leer('app/layout.tsx')
  for (const r of RUTAS) assert.ok(layout.includes(`href="${r}"`), `${r} no está en el pie`)
  assert.ok(leer('app/legal/privacidad/page.tsx').includes('href="/legal/eliminacion-datos"'))
})

test('las páginas escriben «Grupo ASegura» bien y no inventan contacto', () => {
  for (const r of RUTAS) {
    const src = leer(`app${r}/page.tsx`)
    assert.match(src, /siteName: 'Grupo ASegura'/, `${r}: marca mal escrita en metadatos`)
    assert.doesNotMatch(src, /@grupoasegura\.(es|com)/, `${r}: email a mano, debe salir de MEDIADOR`)
    assert.match(src, /identidad\.email/, `${r}: el contacto debe salir de MEDIADOR`)
  }
  assert.match(leer('app/legal/eliminacion-datos/page.tsx'), /un mes/)
})
