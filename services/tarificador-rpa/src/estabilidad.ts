// ESPERA A PANTALLA QUIETA del explorador (14/10/2026, exploración 8d0676f9 de Allianz Hogar: el inventario del paso 3 se
// tomó con la validación asíncrona de la vía/número aún en vuelo; Angular repintó la sección mientras la IA contestaba y el
// nodo de «Año de construcción» ya no era el inventariado → `nodo_no_relocalizado`).
//
// `page.waitForLoadState('networkidle')` NO sirve para esto en una SPA: es un estado de CARGA que se alcanza una vez tras la
// navegación y luego resuelve al instante aunque haya XHR en vuelo. Aquí se mira de verdad:
//   - RED: peticiones xhr/fetch/document de la página (todos sus marcos) empezadas y no terminadas;
//   - DOM: ninguna inserción/eliminación de nodos (MutationObserver `childList`, solo cuenta) en ningún marco durante la
//     ventana de quietud.
// SOLO LECTURA: el observador cuenta mutaciones y se desconecta; no escribe en la página, no pulsa, no navega. Nunca lanza.

import type { Frame, Page, Request } from 'playwright'

export type OpcionesEstabilidad = {
  /** Ventana sin red en vuelo ni cambios en el DOM para darla por quieta. */
  quietoMs: number
  /** Tope total de la espera: pasado, se sigue igualmente (la pantalla que no se calla no bloquea la exploración). */
  topeMs: number
}

export const ESTABILIDAD_POR_DEFECTO: Readonly<OpcionesEstabilidad> = Object.freeze({ quietoMs: 400, topeMs: 5_000 })

/** Tipos de petición que cuentan como «el portal está trabajando» (no imágenes, fuentes ni hojas de estilo). */
const TIPOS_RED = new Set(['xhr', 'fetch', 'document'])

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Mutaciones `childList` en el marco durante `ms`. Si no se puede medir (marco que se va, navegación), `1`: no está quieto. */
async function mutacionesEnMarco(f: Frame, ms: number): Promise<number> {
  const medida = f
    .evaluate((espera: number) => new Promise<number>((resolver) => {
      let n = 0
      const raiz = document.documentElement
      if (!raiz) return resolver(0)
      const o = new MutationObserver((lista) => { n += lista.length })
      o.observe(raiz, { childList: true, subtree: true })
      setTimeout(() => { o.disconnect(); resolver(n) }, espera)
    }), ms)
    .catch(() => 1)
  const tope = new Promise<number>((r) => setTimeout(() => r(1), ms + 2_000).unref?.())
  return Promise.race([medida, tope])
}

/** Vigía de la red de la página: peticiones xhr/fetch/document en vuelo. Se instala UNA vez por bucle para ver también las
 *  que salieron ANTES de empezar a esperar (la validación que dispara el blur de un `rellenar`). */
export type VigiaRed = { enVuelo: () => number; empezadas: () => number; soltar: () => void }

export function vigilarRed(page: Page): VigiaRed {
  const enVuelo = new Set<Request>()
  let empezadas = 0
  const alPedir = (r: Request) => {
    if (!TIPOS_RED.has(r.resourceType())) return
    enVuelo.add(r)
    empezadas++
  }
  const alAcabar = (r: Request) => { enVuelo.delete(r) }
  page.on('request', alPedir)
  page.on('requestfinished', alAcabar)
  page.on('requestfailed', alAcabar)
  return {
    enVuelo: () => enVuelo.size,
    empezadas: () => empezadas,
    soltar: () => {
      page.off('request', alPedir)
      page.off('requestfinished', alAcabar)
      page.off('requestfailed', alAcabar)
      enVuelo.clear()
    },
  }
}

/**
 * Espera a que la página esté QUIETA: sin peticiones xhr/fetch/document en vuelo y sin nodos insertados/quitados en ningún
 * marco durante `quietoMs` seguidos. `estable` si lo consigue; `tope` si se acaba `topeMs` antes. Con `vigia` (el del bucle)
 * cuenta también lo que salió antes de llamar; sin él, solo desde ahora. Nunca lanza.
 */
export async function esperarEstable(page: Page, o: OpcionesEstabilidad = ESTABILIDAD_POR_DEFECTO, vigia?: VigiaRed): Promise<'estable' | 'tope'> {
  const fin = Date.now() + o.topeMs
  const red = vigia ?? vigilarRed(page)
  try {
    for (;;) {
      const resta = fin - Date.now()
      if (resta <= 0) return 'tope'
      if (red.enVuelo() > 0) {
        await dormir(Math.min(50, resta))
        continue
      }
      const ventana = Math.min(o.quietoMs, resta)
      const antes = red.empezadas()
      const marcos = page.frames().filter((f) => !f.isDetached())
      const cambios = (await Promise.all(marcos.map((f) => mutacionesEnMarco(f, ventana)))).reduce((a, b) => a + b, 0)
      if (cambios === 0 && red.enVuelo() === 0 && red.empezadas() === antes && ventana >= o.quietoMs) return 'estable'
    }
  } catch {
    return 'tope'
  } finally {
    if (!vigia) red.soltar()
  }
}
