// Guardián del `image` del `Article` de cada guía.
//
// Por qué existe. El JSON-LD `Article` no declaraba imagen, y Google la pide
// para mostrar el artículo en resultados con miniatura. La imagen que ya se
// sirve y que la página anuncia al compartir es `OG_IMAGEN` (la tarjeta de
// `app/opengraph-image.tsx`). Este test fija que el `image` del Article es esa
// misma URL — la que Next resuelve para `og:image` con `metadataBase` — y no una
// copia escrita a mano que pueda divergir.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ARTICULOS } from './articulos.ts'
import { fichaArticulo } from './seo.ts'
import { OG_IMAGEN, SITIO_URL } from './sitio.ts'

// Next resuelve `openGraph.images` contra `metadataBase` (= SITIO_URL, en layout.tsx).
const OG_IMAGEN_ABSOLUTA = new URL(OG_IMAGEN.url, SITIO_URL).href

test('la página del blog anuncia la misma tarjeta OG que el Article declara', () => {
  const page = readFileSync(join(import.meta.dirname, '..', 'app', 'blog', '[slug]', 'page.tsx'), 'utf8')
  assert.match(page, /images:\s*\[OG_IMAGEN\]/, 'la página ya no anuncia OG_IMAGEN como og:image')
  assert.equal(OG_IMAGEN_ABSOLUTA, `${SITIO_URL}/opengraph-image`)
})

test('cada Article lleva image y es la URL de la og:image', () => {
  assert.ok(ARTICULOS.length >= 1, 'sin artículos el guardián estaría en verde mirando al vacío')
  for (const a of ARTICULOS) {
    const ficha = fichaArticulo(a)
    assert.equal(typeof ficha.image, 'string', `${a.slug}: el Article no lleva image`)
    assert.equal(ficha.image, OG_IMAGEN_ABSOLUTA, `${a.slug}: image no es la og:image de la página`)
  }
})
