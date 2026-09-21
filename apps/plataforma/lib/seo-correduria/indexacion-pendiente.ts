// lib/seo-correduria/indexacion-pendiente.ts — qué URLs del blog llevan sin indexar y el prompt
// de Claude Chrome ya armado para pedir su indexación en Search Console.
//
// La Search Console API NO tiene endpoint de «solicitar indexación» para páginas normales (solo
// Job/BroadcastEvent): ese botón solo existe en la UI web, atado a la sesión OAuth de Alberto. Por
// eso esto no lo dispara solo — deja el prompt listo y Alberto lo pega en Claude Chrome en un clic.
// Caso fundacional: 21/09/2026, tres URLs de blog pedidas a mano tras diagnosticar que el pipeline
// técnico (sitemap/robots/enlazado interno) ya estaba correcto y lo único que faltaba era esto.
//
// Solo mira `/blog/*`: son las únicas páginas con fecha de publicación conocida y, por tanto, las
// únicas donde «lleva sin indexar 2 semanas» es una señal real y no ruido de una URL genérica.

import type { DatosCobertura } from './tipos'

/** URLs del blog que la URL Inspection API AÚN no da por indexadas (verdict !== PASS). */
export function urlsBlogPendientesIndexar(cobertura: DatosCobertura): string[] {
  return cobertura.paginas
    .filter(p => p.url.includes('/blog/') && p.estado === 'ok' && p.verdicto !== 'PASS')
    .map(p => p.url)
}

const SEARCH_CONSOLE_URL = 'https://search.google.com/search-console?resource_id=sc-domain:grupoasegura.es'

/** El prompt de Claude Chrome, listo para pegar. `null` si no hay ninguna URL pendiente. */
export function promptClaudeChromeIndexacion(urls: string[]): string | null {
  if (!urls.length) return null
  const lista = urls.map((u, i) => `${i + 1}. ${u}`).join('\n')
  const demostrativo = urls.length > 1 ? 'estas' : 'esta'
  const plural = urls.length > 1 ? 's' : ''
  return (
    `Ve a ${SEARCH_CONSOLE_URL}\n\n` +
    `Para cada una de ${demostrativo} ${urls.length} URL${plural}, usa la Inspección de URL ` +
    `(barra superior) y pulsa "Solicitar indexación":\n\n${lista}\n\n` +
    `Para cada una: pega la URL completa en el cuadro de inspección, espera el resultado, y si aparece ` +
    `el botón "Solicitar indexación" púlsalo y espera la confirmación antes de pasar a la siguiente. Si ` +
    `alguna ya aparece indexada o con la petición ya en curso, dilo y pasa a la siguiente sin repetir la ` +
    `solicitud.`
  )
}
