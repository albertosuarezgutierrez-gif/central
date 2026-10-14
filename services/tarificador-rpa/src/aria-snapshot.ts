// Árbol de accesibilidad COMPLETO de la pantalla del fallo (14/10/2026, Fase 1 de TARIFICADOR-OPTIMIZACION-AUDITORIA).
//
// Un fallo de mapa revelaba UN solo hueco; con `page.ariaSnapshot({ mode: 'ai' })` (recorre iframes y añade [ref=eN]) el
// fallo trae la pantalla entera (campos, botones, diálogos, ventana de poblaciones…) para mapearla de una vez.
//
// PRIVACIDAD: el snapshot lleva los VALORES de los campos (`- textbox "NIF" [ref=e4]: 12345678Z`). `redactarAriaSnapshot`
// los sustituye por «valor» y además tapa patrones sensibles en cualquier sitio. El resultado viaja como sección
// `<!-- tarificador:aria … -->` AL FINAL del fichero de evidencia HTML (mismo contrato; el servidor no cambia), que además
// pasa por `redactarHtml` en el runner. Nunca cambia el resultado de un trabajo: si falla o tarda, no hay sección.

import type { Page } from 'playwright'
import { cortarEnLimiteDeLinea, redactarAriaSnapshot, MARCA_VALOR_ARIA } from '@central/module-tarificacion'

export const MARCA_ARIA = '<!-- tarificador:aria'
const FIN_ARIA = '\n-->'
export const MARCA_VALOR = MARCA_VALOR_ARIA
export const MARCA_RECORTE = '…[recortado]'
export const MAX_BYTES_ARIA = 200 * 1024
export const TIMEOUT_ARIA_MS = 5_000

// La redacción (valores de campos + opciones elegidas + patrones sensibles) es compartida con el servidor:
// `@central/module-tarificacion` (aria-redaccion.ts).
export { redactarAriaSnapshot }

/** Recorta a `maxBytes` UTF-8 (sin partir un carácter) y marca el recorte. */
export function recortarBytes(texto: string, maxBytes: number): string {
  if (Buffer.byteLength(texto) <= maxBytes) return texto
  const cola = `\n${MARCA_RECORTE}`
  const corte = Math.max(0, maxBytes - Buffer.byteLength(cola))
  const entero = Buffer.from(texto)
  let cortado = entero.subarray(0, corte).toString('utf8').replace(/\uFFFD+$/, '')
  // En un límite de línea (si lo hay): nunca deja un dato partido por la mitad al final.
  if (entero[corte] !== 0x0a) {
    const nl = cortado.lastIndexOf('\n')
    if (nl > 0) cortado = cortado.slice(0, nl)
  }
  return cortado + cola
}

/** Sección lista para pegar tras el HTML de evidencia. Un `-->` dentro cerraría el comentario: se neutraliza. */
export function seccionAria(redactado: string): string {
  return `\n${MARCA_ARIA}\n${redactado.replace(/--+>/g, '->').replace(/--!>/g, '->')}${FIN_ARIA}\n`
}

/** Deshace `seccionAria`: el HTML sin la sección y el snapshot (o `null`). */
export function separarAria(html: string): { html: string; aria: string | null } {
  const i = html.lastIndexOf(`\n${MARCA_ARIA}\n`)
  if (i < 0) return { html, aria: null }
  const resto = html.slice(i + MARCA_ARIA.length + 2)
  const fin = resto.lastIndexOf(FIN_ARIA)
  return { html: html.slice(0, i), aria: fin < 0 ? resto : resto.slice(0, fin) }
}

/**
 * Snapshot de accesibilidad de la página REDACTADO y acotado, o `null` si falla, tarda más de `timeoutMs` o está vacío.
 * Nunca lanza.
 */
export async function capturarAriaRedactado(page: Page, opts: { maxBytes?: number; timeoutMs?: number } = {}): Promise<string | null> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES_ARIA
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_ARIA_MS
  let temporizador: ReturnType<typeof setTimeout> | undefined
  try {
    const crudo = await Promise.race([
      page.ariaSnapshot({ mode: 'ai', timeout: timeoutMs }),
      new Promise<null>((resolve) => { temporizador = setTimeout(() => resolve(null), timeoutMs + 500) }),
    ])
    if (typeof crudo !== 'string' || crudo.trim() === '') return null
    // REDACTAR primero, recortar después: un recorte previo podía partir un DNI/teléfono/fecha y dejarlo fuera de los
    // patrones. Solo por coste se acota antes (holgado, ×4) y EN UN LÍMITE DE LÍNEA; el recorte final (también en límite de
    // línea, la marca cuenta en el tope) va sobre texto ya redactado, así que nunca destapa nada.
    const previo = cortarEnLimiteDeLinea(crudo, maxBytes * 4)
    return recortarBytes(redactarAriaSnapshot(previo), maxBytes)
  } catch {
    return null
  } finally {
    if (temporizador) clearTimeout(temporizador)
  }
}
