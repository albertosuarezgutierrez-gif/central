import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearSitemap, soloDelDominio, urlsAInspeccionar } from './sitemap.ts'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>https://grupoasegura.es</loc>
<changefreq>monthly</changefreq>
</url>
<url>
<loc>https://grupoasegura.es/blog/a</loc>
<lastmod>2026-09-15T00:00:00.000Z</lastmod>
</url>
<url>
<loc>https://grupoasegura.es/legal/privacidad</loc>
<lastmod>2026-09-01</lastmod>
</url>
</urlset>`

test('parsearSitemap: loc y lastmod; sin lastmod → null', () => {
  assert.deepEqual(parsearSitemap(XML), [
    { url: 'https://grupoasegura.es', lastmod: null },
    { url: 'https://grupoasegura.es/blog/a', lastmod: '2026-09-15T00:00:00.000Z' },
    { url: 'https://grupoasegura.es/legal/privacidad', lastmod: '2026-09-01' },
  ])
})

test('parsearSitemap: basura → lista vacía, no revienta', () => {
  assert.deepEqual(parsearSitemap('<html>404</html>'), [])
})

test('urlsAInspeccionar: primero las de consultas, luego el sitemap sin legales ni repetidas', () => {
  const r = urlsAInspeccionar(['https://grupoasegura.es/blog/a', 'https://grupoasegura.es/seguros/hogar'], parsearSitemap(XML))
  assert.deepEqual(r, ['https://grupoasegura.es/blog/a', 'https://grupoasegura.es/seguros/hogar', 'https://grupoasegura.es'])
})

test('urlsAInspeccionar: sin sitemap (no se pudo leer) quedan las de consultas', () => {
  assert.deepEqual(urlsAInspeccionar(['https://grupoasegura.es/x'], null), ['https://grupoasegura.es/x'])
})

test('enviarSitemapGsc: PUT a la propiedad con el sitemap codificado; 403 lanza con la pista del permiso', async () => {
  const { enviarSitemapGsc } = await import('./sitemap.ts')
  let llamada: { url: string; metodo?: string } | null = null
  await enviarSitemapGsc('tok', 'sc-domain:grupoasegura.es', 'https://grupoasegura.es/sitemap.xml', async (url, init) => {
    llamada = { url, metodo: init?.method }
    return new Response(null, { status: 204 })
  })
  assert.deepEqual(llamada, {
    url: 'https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Agrupoasegura.es/sitemaps/https%3A%2F%2Fgrupoasegura.es%2Fsitemap.xml',
    metodo: 'PUT',
  })
  await assert.rejects(
    enviarSitemapGsc('tok', 'p', 'https://x/sitemap.xml', async () => new Response('forbidden', { status: 403 })),
    /403 \(la cuenta de servicio necesita permiso «Completo»/,
  )
})

test('soloDelDominio: fuera las URLs de otro host, http o mal formadas', () => {
  const r = soloDelDominio(
    [
      { url: 'https://grupoasegura.es/a', lastmod: null },
      { url: 'https://www.grupoasegura.es/b', lastmod: null },
      { url: 'https://evil.example/grupoasegura.es', lastmod: null },
      { url: 'https://grupoasegura.es.evil.example/c', lastmod: null },
      { url: 'http://grupoasegura.es/d', lastmod: null },
      { url: 'no-es-una-url', lastmod: null },
    ],
    'grupoasegura.es',
  )
  assert.deepEqual(r.map((e) => e.url), ['https://grupoasegura.es/a', 'https://www.grupoasegura.es/b'])
})

test('parsearSitemap: <url> con atributos también cuenta; <urlset> no se confunde con <url>', () => {
  const xml = '<urlset xmlns="x"><url data-x="1"><loc>https://grupoasegura.es/a</loc></url></urlset>'
  assert.deepEqual(parsearSitemap(xml), [{ url: 'https://grupoasegura.es/a', lastmod: null }])
})
