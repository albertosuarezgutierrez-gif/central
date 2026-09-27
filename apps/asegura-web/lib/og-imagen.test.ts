// Guardián de la tarjeta de compartir (og:image) — 27/09/2026.
//
// Next NO hereda la imagen de `app/opengraph-image.tsx` en una página que declara
// su propio `openGraph`: el objeto hijo sustituye al del padre entero. Así salían
// sin imagen en WhatsApp/LinkedIn los ramos, el blog y las guías — y cada página
// nueva con `openGraph` volvería a salir igual sin que fallara nada. Este test lee
// el fuente: toda página con `openGraph:` tiene que pedir `images: [OG_IMAGEN]`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { OG_IMAGEN } from './sitio.ts'

const APP = join(import.meta.dirname, '..', 'app')

function paginas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return paginas(p)
    return n === 'page.tsx' ? [p] : []
  })
}

test('toda página con openGraph propio declara la imagen de la tarjeta', () => {
  const conOg = paginas(APP).filter((p) => readFileSync(p, 'utf8').includes('openGraph:'))
  assert.ok(conOg.length >= 7, `solo ${conOg.length} páginas con openGraph: el barrido no mira donde debe`)
  const sinImagen = conOg.filter((p) => !/images:\s*\[OG_IMAGEN\]/.test(readFileSync(p, 'utf8')))
  assert.deepEqual(sinImagen, [], 'páginas que saldrían sin imagen al compartirlas')
})

test('la tarjeta apunta a la ruta que genera opengraph-image.tsx, con su tamaño', () => {
  assert.equal(OG_IMAGEN.url, '/opengraph-image')
  const fuente = readFileSync(join(APP, 'opengraph-image.tsx'), 'utf8')
  assert.match(fuente, /size = \{ width: OG_IMAGEN\.width, height: OG_IMAGEN\.height \}/)
})
