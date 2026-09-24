// lib/seo-correduria/sitemap.ts — las URLs reales de la web, leídas de su propio sitemap.
//
// Hasta el 24/09/2026 el cron solo inspeccionaba las páginas que cita `consultas.ts`, y así una
// página nueva (`/telefonos-siniestros`) no la miraba nadie: ni se sabía si Google la conocía ni
// entraba en el aviso de «pide la indexación». El sitemap lo genera la web desde las mismas
// fuentes que sus páginas, así que es la lista de verdad. `fetch` se inyecta para los tests.

import type { FetchLike } from './tipos.ts'

export type EntradaSitemap = { url: string; lastmod: string | null }

/** `<url><loc>…</loc><lastmod>…</lastmod></url>` → entradas. Tolerante: sin `lastmod` → `null`. */
export function parsearSitemap(xml: string): EntradaSitemap[] {
  const entradas: EntradaSitemap[] = []
  for (const bloque of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = bloque.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1]
    if (!loc) continue
    const lastmod = bloque.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1] ?? null
    entradas.push({ url: loc.replace(/&amp;/g, '&'), lastmod })
  }
  return entradas
}

/**
 * Solo las entradas de NUESTRO dominio (con o sin `www.`). El sitemap es nuestro, pero lo que sale
 * de aquí acaba en la URL Inspection API y en IndexNow: una URL ajena (un sitemap manipulado o un
 * error de generación) no debe llegar a ninguno de los dos.
 */
export function soloDelDominio(entradas: readonly EntradaSitemap[], dominio: string): EntradaSitemap[] {
  return entradas.filter(e => {
    try {
      const u = new URL(e.url)
      return u.protocol === 'https:' && (u.hostname === dominio || u.hostname === `www.${dominio}`)
    } catch {
      return false
    }
  })
}

/** Lee `https://<dominio>/sitemap.xml`. Lanza si no responde 200 o viene vacío: quien llama decide el fallback. */
export async function leerSitemap(dominio: string, fetch: FetchLike, timeoutMs = 10_000): Promise<EntradaSitemap[]> {
  const res = await fetch(`https://${dominio}/sitemap.xml`, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`sitemap ${res.status}`)
  const entradas = soloDelDominio(parsearSitemap(await res.text()), dominio)
  if (entradas.length === 0) throw new Error('sitemap sin URLs del dominio')
  return entradas
}

/**
 * Las URLs a inspeccionar: las de `consultas.ts` (siempre, van primero: son las de intención de
 * compra) más las del sitemap que no sean legales, sin repetir.
 */
export function urlsAInspeccionar(propias: readonly string[], sitemap: readonly EntradaSitemap[] | null): string[] {
  const todas = [...propias]
  for (const e of sitemap ?? []) if (!e.url.includes('/legal/') && !todas.includes(e.url)) todas.push(e.url)
  return todas
}

/**
 * Reenvía el sitemap a Search Console (`sitemaps.submit`). A diferencia de «solicitar indexación»,
 * esto SÍ tiene API oficial. Pide el scope de escritura `webmasters` y que la cuenta de servicio
 * tenga permiso «Completo» en la propiedad: con permiso restringido Google responde 403, y eso se
 * dice tal cual (lanza con el código) en vez de darlo por enviado.
 * Caso fundacional (24/09/2026): 4 páginas que SÍ estaban en el sitemap salían en Search Console
 * como «Google no reconoce esta URL · no se ha detectado ningún sitemap de referencia»: Google no
 * lo había vuelto a leer desde que se añadieron.
 */
export async function enviarSitemapGsc(
  token: string,
  propiedad: string,
  sitemapUrl: string,
  fetch: FetchLike,
): Promise<void> {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propiedad)}/sitemaps/${encodeURIComponent(sitemapUrl)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const cuerpo = (await res.text().catch(() => '')).slice(0, 200)
    const pista = res.status === 403 ? ' (la cuenta de servicio necesita permiso «Completo» en Search Console)' : ''
    throw new Error(`sitemaps.submit ${res.status}${pista}: ${cuerpo}`)
  }
}
