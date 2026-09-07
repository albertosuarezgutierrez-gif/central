// Guardián del enlazado interno.
//
// Por qué existe: el 07/09/2026 `/seguros/responsabilidad-civil` llevaba desde
// su creación sin un solo enlace entrante. La página se construía, el sitemap la
// listaba y `tsc` estaba verde — no hay nada en una app de Next que falle porque
// una página no se enlace. Y una página huérfana no es un detalle de SEO: todo
// el peso interno de un sitio viaja por sus enlaces, así que Google la rastrea y
// no tiene ningún motivo para posicionarla.
//
// Es el mismo tipo de red que `ramos.test.ts`: barata y difícil de saltarse sin
// enterarse.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// Se importa el fichero de la marca DIRECTAMENTE y no el barril `@central/brand`:
// ese barril reexporta con imports sin extensión, que `tsc` y Next resuelven y
// `node --test` no. Aquí interesa el objeto de la marca, no el paquete entero.
import { MARCA_ASEGURA } from '../../../packages/brand/src/marcas/asegura.ts'
import { ARTICULOS, entradasSitemapBlog } from './articulos.ts'
import { RAMOS } from './ramos.ts'
import { NAV, NAV_CABECERA, url } from './sitio.ts'

test('ningún ramo se queda sin enlace en el pie (nada huérfano)', () => {
  // `Set<string>` explícito: `NAV` es `as const`, así que su `href` es una unión
  // de literales y el Set heredaría ese tipo, rechazando la consulta genérica.
  const enNav = new Set<string>(NAV.map((n) => n.href))
  for (const r of RAMOS) {
    assert.ok(enNav.has(`/seguros/${r.slug}`), `ramo huérfano: /seguros/${r.slug} no está en NAV`)
  }
})

test('la NAV no enlaza ramos que no existen (nada roto)', () => {
  const slugs = new Set(RAMOS.map((r) => r.slug))
  for (const n of NAV) {
    if (!n.href.startsWith('/seguros/')) continue
    assert.ok(slugs.has(n.href.replace('/seguros/', '')), `NAV enlaza un ramo inexistente: ${n.href}`)
  }
})

// 🚨 Medido, no estético: con seis entradas la cabecera desbordaba y lo que se
// salía de la pantalla era el botón «Área de clientes». Ver el comentario de
// `NAV_CABECERA` en `sitio.ts`.
test('la cabecera no crece más allá de lo medido', () => {
  assert.ok(NAV_CABECERA.length <= 5, `la cabecera lleva ${NAV_CABECERA.length} entradas; se midió el desborde a partir de 6`)
  for (const n of NAV_CABECERA) assert.ok(n.href.startsWith('/seguros/'))
})

test('cada página de ramo enlaza a sus hermanas y a cambiar-de-correduria', () => {
  const fuente = readFileSync(new URL('../app/seguros/[ramo]/page.tsx', import.meta.url), 'utf8')
  assert.match(fuente, /RAMOS\.filter\(\(r\) => r\.slug !== ramo\.slug\)/, 'la página de ramo ya no enlaza a las hermanas')
  assert.match(fuente, /href="\/cambiar-de-correduria"/, 'la página de ramo ya no enlaza a cambiar-de-correduria')
})

// El sitemap declaraba `lastModified: new Date()` en las once URL: cada
// petición decía «todo ha cambiado hoy». Un lastmod que siempre miente enseña al
// buscador a ignorar el campo en todo el sitio. Donde no se sabe la fecha, se
// omite.
test('el sitemap no inventa fechas de modificación', () => {
  const fuente = readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(fuente, /lastModified:\s*(new Date\(\)|ahora)/, 'el sitemap vuelve a declarar la fecha de hoy como fecha de cambio')
  assert.match(fuente, /FECHA_TEXTOS_WEB/, 'las legales deben fechar con la versión de los textos públicos')
})

// La tarjeta que se ve al pegar un enlace en WhatsApp o LinkedIn. Se genera
// desde `MEDIADOR` y `MARCA_ASEGURA`; si alguien la sustituye por un PNG con el
// texto quemado, el día que cambie la clave DGSFP la tarjeta mentirá en silencio.
test('la imagen Open Graph se genera desde la fuente de marca', () => {
  const fuente = readFileSync(new URL('../app/opengraph-image.tsx', import.meta.url), 'utf8')
  assert.match(fuente, /MARCA_ASEGURA/)
  assert.match(fuente, /MEDIADOR/)
  assert.doesNotMatch(fuente, /CS-F\/\d/, 'la clave DGSFP se lee de MEDIADOR, no se teclea')
  // 🚨 Satori (el motor de `next/og`) no entiende `oklch()`: un token en ese
  // formato no falla, se ignora, y la tarjeta sale con el fondo transparente.
  // Los tres colores que usa la imagen tienen que seguir siendo hex.
  for (const token of ['primario', 'acento', 'acentoInk'] as const) {
    assert.match(MARCA_ASEGURA.paleta[token], /^#[0-9a-fA-F]{6}$/, `paleta.${token} ya no es hex: la imagen OG lo ignoraría`)
  }
})

// 🚨 Los tres cepos del blog, y son de lo MISMO que el de responsabilidad civil:
// una página que solo existe en el sitemap es una página huérfana. `tsc` está
// verde tanto si `/blog` se enlaza como si no, y el día que alguien reordene el
// pie el blog entero se queda sin puerta de entrada sin que falle nada.
test('el blog tiene enlace entrante desde el pie', () => {
  const fuente = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  assert.match(fuente, /href="\/blog"/, 'el pie ya no enlaza al blog: los artículos quedan huérfanos')
})

test('cada página de ramo enlaza a sus artículos', () => {
  const fuente = readFileSync(new URL('../app/seguros/[ramo]/page.tsx', import.meta.url), 'utf8')
  assert.match(fuente, /articulosDeRamo\(ramo\.slug\)/, 'la página de ramo ya no enlaza a sus guías')
  assert.match(fuente, /href=\{`\/blog\/\$\{a\.slug\}`\}/, 'la página de ramo ya no construye el enlace al artículo')
})

// 🚨 Este SÍ ejecuta el código y mira lo que sale. Su primera versión leía
// `app/sitemap.ts` con expresiones regulares y se quedaba verde con la lista de
// artículos borrada del sitemap (el texto del cuerpo del `map` seguía en el
// fichero). Por eso la construcción se movió a una función pura.
test('el sitemap emite una URL por artículo, fechada con la fecha del artículo', () => {
  const filas = entradasSitemapBlog()
  const indice = filas.find((f) => f.url === url('/blog'))
  assert.ok(indice, 'el sitemap ya no lista el índice del blog')

  for (const a of ARTICULOS) {
    const fila = filas.find((f) => f.url === url(`/blog/${a.slug}`))
    assert.ok(fila, `el sitemap no lista el artículo ${a.slug}`)
    assert.equal(
      fila!.lastModified.toISOString().slice(0, 10),
      a.revisado ?? a.fecha,
      `${a.slug}: el sitemap lo fecha con algo que no es su propia fecha`,
    )
  }
  assert.equal(filas.length, ARTICULOS.length + 1, 'el sitemap emite filas de blog que no corresponden a ningún artículo')
})

// La fecha de hoy en `lastModified` es el `NULL` colapsado a un valor que
// prohíbe `CLAUDE.md`: le dice al buscador «he cambiado» cada vez que pide el
// sitemap, y así se aprende a ignorar el campo en todo el sitio.
//
// 🚨 Con artículos REALES este cepo no podía ponerse rojo: los tres se
// publicaron el mismo día, así que `new Date()` y `a.fecha` daban lo mismo. Por
// eso se le pasan artículos de prueba con fechas del pasado.
test('el sitemap no fecha el blog con la hora de la petición', () => {
  const falso = (slug: string, fecha: string, revisado?: string) =>
    ({ ...ARTICULOS[0], slug, fecha, revisado }) as (typeof ARTICULOS)[number]
  const filas = entradasSitemapBlog([falso('viejo', '2020-01-02'), falso('medio', '2021-03-04', '2022-05-06')])

  const porUrl = new Map(filas.map((f) => [f.url, f.lastModified.toISOString().slice(0, 10)]))
  assert.equal(porUrl.get(url('/blog/viejo')), '2020-01-02')
  // `revisado` gana a `fecha`: es cuándo cambió el contenido, que es lo que
  // `lastModified` significa.
  assert.equal(porUrl.get(url('/blog/medio')), '2022-05-06')
  // El índice se fecha con el artículo más reciente, no con hoy ni con el más viejo.
  assert.equal(porUrl.get(url('/blog')), '2022-05-06')
})
