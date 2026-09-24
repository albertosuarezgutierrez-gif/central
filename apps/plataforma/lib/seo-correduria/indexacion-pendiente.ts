// lib/seo-correduria/indexacion-pendiente.ts — qué URLs del blog llevan sin indexar y el prompt
// de Claude Chrome ya armado para pedir su indexación en Search Console.
//
// La Search Console API NO tiene endpoint de «solicitar indexación» para páginas normales (solo
// Job/BroadcastEvent): ese botón solo existe en la UI web, atado a la sesión OAuth de Alberto. Por
// eso esto no lo dispara solo — deja el prompt listo y Alberto lo pega en Claude Chrome en un clic.
// Caso fundacional: 21/09/2026, tres URLs de blog pedidas a mano tras diagnosticar que el pipeline
// técnico (sitemap/robots/enlazado interno) ya estaba correcto y lo único que faltaba era esto.
//
// Hasta el 24/09/2026 solo miraba `/blog/*`, y así `/seguros/comunidades`, `/seguros/comercio` y
// `/gestor-de-seguros` llevaban semanas «descubiertas sin indexar» sin que nadie lo pidiera. Ahora
// entra cualquier página propia salvo las legales (no se posicionan: pedirlas gastaría cupo).

import type { DatosCobertura } from './tipos'

/**
 * Páginas propias (no legales) que la URL Inspection API AÚN no da por indexadas (verdict !== PASS).
 * Una fila en `error` no entra: no se ha podido mirar, y pedir a ciegas gasta el cupo diario.
 */
export function urlsPendientesIndexar(cobertura: DatosCobertura): string[] {
  return cobertura.paginas
    .filter(p => !p.url.includes('/legal/') && p.estado === 'ok' && p.verdicto !== 'PASS')
    .map(p => p.url)
}

/** Search Console deja pedir ~10 indexaciones al día: el prompt no pide más, el resto espera a la semana siguiente. */
export const MAX_SOLICITUDES_DIA = 10

const SEARCH_CONSOLE_URL = 'https://search.google.com/search-console?resource_id=sc-domain:grupoasegura.es'

/** El prompt de Claude Chrome, listo para pegar. `null` si no hay ninguna URL pendiente. */
export function promptClaudeChromeIndexacion(urls: string[]): string | null {
  if (!urls.length) return null
  const resto = urls.length - MAX_SOLICITUDES_DIA
  urls = urls.slice(0, MAX_SOLICITUDES_DIA)
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
    `solicitud.` +
    (resto > 0 ? `\n\n(Quedan ${resto} más: Search Console no admite más de ~${MAX_SOLICITUDES_DIA} al día. Van en el aviso de la semana que viene.)` : '')
  )
}
