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
import { RAMOS } from './ramos.ts'
import { NAV, NAV_CABECERA } from './sitio.ts'

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
