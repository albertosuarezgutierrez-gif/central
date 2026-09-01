import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Guardian de ALCANCE, no de contenido. El resumen del ciclo de mensajes se puso en
// /apartamentos porque es donde Alberto lo pidio, y al mirarlo resulto que esa pagina llevaba
// desde el 16/07/2026 SIN entrada en la barra lateral (se cayo al fusionar Resumen+Banca): la
// ruta seguia viva y respondia 200, asi que ninguna prueba la echaba de menos, pero para llegar
// habia que saberse la URL o el Cmd+K. Una pantalla a la que no se llega es una pantalla que no
// existe, y esto es justo lo que ningun `tsc` ni `next build` puede cazar.
// Se leen los FUENTES porque importarlos arrastraria React, Prisma y `next/navigation`.

function fuente(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8')
}

test('la barra lateral enlaza /apartamentos', () => {
  const sidebar = fuente('../../../app/(usuario)/UserSidebar.tsx')
  assert.match(
    sidebar,
    /href:\s*'\/apartamentos'/,
    'sin esta entrada la pagina existe pero no se llega a ella desde el menu',
  )
})

test('/apartamentos monta el resumen de mensajes al huesped', () => {
  const page = fuente('../../../app/(usuario)/apartamentos/page.tsx')
  assert.match(page, /import\s+MensajesHuesped\s+from/)
  assert.match(page, /<MensajesHuesped\s*\/>/)
})
