// CAPTURA y OPCIONES de un ATASCO (21/10/2026, Alberto en el móvil no podía resolver «Bots atascados»: Allianz Hogar parado
// en la población del CP sin foto ni nada que elegir; trabajos 229b2fc5/b5089267).
//
//   · Captura JPEG (calidad 70, solo la ventana) cuando el trabajo para en un ATASCO o en un HUECO de mapa. Con datos
//     personales del tomador en el riesgo TAMBIÉN se envía (decisión de Alberto, 21/10/2026): una imagen no se redacta, así
//     que viaja marcada `capturaConDatos` y asegura la guarda como la evidencia HTML (documento del cliente, misma retención
//     de 15 días, solo por el puerto del operador y SIN Telegram). Fuera de un atasco/hueco, la regla de siempre: PNG y solo
//     sin datos personales.
//   · Opciones VISIBLES (solo texto, redactado) de la lista desplegable cuando el atasco es de elegir una opción: la pantalla
//     las enseña como botones (las que casan con un candidato numerado) y, si no las hay, lo dice.

import type { Page } from 'playwright'

/** Opciones de lista que se leen (Angular Material, NDBX de Allianz y ARIA). */
export const SELECTOR_OPCIONES_VISIBLES = '[role=option], mat-option, nx-autocomplete-option, nx-dropdown-item'
export const MAX_OPCIONES_ATASCO = 30
export const MAX_LARGO_OPCION = 120
export const CALIDAD_JPEG_ATASCO = 70

/** Textos de opción limpios: espacios colapsados, sin vacíos ni repetidos, redactados, ≤120 caracteres, ≤30. PURA. */
export function limpiarOpciones(textos: readonly unknown[], redactar: (t: string) => string = (t) => t): string[] {
  const out: string[] = []
  const vistos = new Set<string>()
  for (const t of textos) {
    if (typeof t !== 'string') continue
    const limpio = redactar(t.replace(/\s+/g, ' ').trim()).slice(0, MAX_LARGO_OPCION).trim()
    if (!limpio || vistos.has(limpio)) continue
    vistos.add(limpio)
    out.push(limpio)
    if (out.length >= MAX_OPCIONES_ATASCO) break
  }
  return out
}

/** ¿Este fallo lleva la captura de atasco (JPEG)? Solo un atasco con checkpoint o un hueco de mapa. PURA. */
export function pideCapturaAtasco(o: { hayAtasco: boolean; huecoMapa: boolean }): boolean {
  return o.hayAtasco || o.huecoMapa
}

/**
 * Qué captura viaja a asegura. PURA.
 *   · JPEG del atasco (si lo hay y cabe): siempre; `conDatos` = el riesgo lleva datos personales del tomador.
 *   · Si no, el PNG de siempre, SOLO sin datos personales (regla anterior: una imagen no se redacta).
 *   · Nada → `null` (la pantalla dirá «sin captura»).
 */
export function capturaParaCable(o: { png: Buffer | null; jpegAtasco: Buffer | null; hayDatosPersonales: boolean; maxBytes: number }): { base64: string; conDatos: boolean } | null {
  if (o.jpegAtasco && o.jpegAtasco.length > 0 && o.jpegAtasco.length <= o.maxBytes) return { base64: o.jpegAtasco.toString('base64'), conDatos: o.hayDatosPersonales }
  if (o.png && !o.hayDatosPersonales && o.png.length > 0 && o.png.length <= o.maxBytes) return { base64: o.png.toString('base64'), conDatos: false }
  return null
}

/** Pantallazo JPEG de la ventana (no la página entera). Nunca lanza: `null` si falla. */
export async function capturaJpegAtasco(page: Pick<Page, 'screenshot'>): Promise<Buffer | null> {
  return page.screenshot({ type: 'jpeg', quality: CALIDAD_JPEG_ATASCO, fullPage: false, timeout: 10_000 }).catch(() => null)
}

/** Textos de las opciones de lista VISIBLES en todos los marcos (crudos; se limpian con `limpiarOpciones`). Nunca lanza. */
export async function leerOpcionesVisibles(page: Pick<Page, 'frames'>): Promise<string[]> {
  const out: string[] = []
  for (const f of page.frames()) {
    if (f.isDetached() || out.length >= MAX_OPCIONES_ATASCO * 2) continue
    const textos = await f
      .evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel))
          .filter((el) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
          .map((el) => ((el as HTMLElement).innerText || el.textContent || '').slice(0, 300))
          .slice(0, 60)
      }, SELECTOR_OPCIONES_VISIBLES)
      .catch(() => [] as string[])
    out.push(...textos)
  }
  return out
}
