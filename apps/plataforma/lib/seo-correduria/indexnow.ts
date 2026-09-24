// lib/seo-correduria/indexnow.ts — avisar a Bing (y Yandex, Seznam…) de las URLs nuevas o cambiadas.
//
// Google NO usa IndexNow; Bing sí, y Bing alimenta también a ChatGPT y Copilot. El protocolo pide
// avisar solo de lo que cambia —reenviar todo cada semana enseña al buscador a ignorarte—, así que
// se guarda lo ya avisado (fila `fuente='indexnow'` de `seo_correduria_semana`) y se manda la
// diferencia: URLs que no estaban, o cuyo `lastmod` del sitemap ha cambiado.
//
// La clave es PÚBLICA por diseño: el buscador la verifica leyendo `https://<dominio>/<clave>.txt`,
// que sirve `apps/asegura-web/public/`. Un test compara esta constante con ese fichero.

import type { EntradaSitemap } from './sitemap.ts'
import type { FetchLike } from './tipos.ts'

export const INDEXNOW_CLAVE = 'ffa5eb8e9b6bd9192f772dc833b742d3'
export const INDEXNOW_API = 'https://api.indexnow.org/indexnow'

/** Lo que ya se avisó: url → lastmod que tenía entonces (`null` = el sitemap no daba fecha). */
export type AvisadasIndexNow = Record<string, string | null>

/** Las URLs a avisar: nuevas respecto a `previas` o con `lastmod` distinto. */
export function urlsParaIndexNow(sitemap: readonly EntradaSitemap[], previas: AvisadasIndexNow): string[] {
  return sitemap.filter(e => !(e.url in previas) || previas[e.url] !== e.lastmod).map(e => e.url)
}

/** El estado a guardar tras un envío correcto: lo de antes más lo de ahora (lo que salió del sitemap se conserva). */
export function avisadasTras(previas: AvisadasIndexNow, sitemap: readonly EntradaSitemap[]): AvisadasIndexNow {
  const nuevas: AvisadasIndexNow = { ...previas }
  for (const e of sitemap) nuevas[e.url] = e.lastmod
  return nuevas
}

/**
 * POST a IndexNow. 200 y 202 son éxito (202 = recibido, pendiente de verificar la clave). Cualquier
 * otro código lanza con el texto: 403 = la clave no se encuentra en la web, 422 = URL de otro host.
 */
export async function enviarIndexNow(dominio: string, urls: readonly string[], fetch: FetchLike): Promise<number> {
  const res = await fetch(INDEXNOW_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: dominio,
      key: INDEXNOW_CLAVE,
      keyLocation: `https://${dominio}/${INDEXNOW_CLAVE}.txt`,
      urlList: urls,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`IndexNow ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }
  return res.status
}
