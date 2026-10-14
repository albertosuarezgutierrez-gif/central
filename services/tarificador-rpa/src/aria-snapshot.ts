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
import { redactarDatosPersonales } from '@central/module-tarificacion'

export const MARCA_ARIA = '<!-- tarificador:aria'
const FIN_ARIA = '\n-->'
export const MARCA_VALOR = '«valor»'
export const MARCA_RECORTE = '…[recortado]'
export const MAX_BYTES_ARIA = 200 * 1024
export const TIMEOUT_ARIA_MS = 5_000

/** Roles cuyo VALOR (lo escrito/elegido) va tras los dos puntos y se sustituye siempre. */
const ROL_CON_VALOR = '(?:textbox|combobox|spinbutton|searchbox|slider)'
// `- textbox "Nombre" [ref=e3] [disabled]: valor` (nombre entre comillas con escapes, atributos entre corchetes).
const LINEA_CAMPO = new RegExp(`^(\\s*-\\s+${ROL_CON_VALOR})((?:\\s+"(?:[^"\\\\]|\\\\.)*")?(?:\\s*\\[[^\\]]*\\])*)(?:\\s*:(.*))?$`)
const LINEA_CAMPO_SUELTA = new RegExp(`^(\\s*-\\s+${ROL_CON_VALOR})\\b`)
const LINEA_URL = /^(\s*-\s+\/url:\s*)(\S*?)(?:[?#].*)?$/
const FECHAS = [
  /\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}\b/g, // dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa
  /\b(?:19|20)\d{2}[/.-]\d{1,2}[/.-]\d{1,2}\b/g, // aaaa-mm-dd
]
const MARCA_DATO = '[DATO]'

function sangria(l: string): number {
  return l.length - l.trimStart().length
}

/**
 * Redacta el texto de `ariaSnapshot`. PURA. Conserva roles, nombres accesibles, refs y estructura. Fail-closed:
 * una línea de campo que no se sabe interpretar pierde todo lo que sigue al rol.
 */
export function redactarAriaSnapshot(texto: string): string {
  const lineas = String(texto).split('\n')
  const out: string[] = []
  let sangriaCampo = -1 // sangría de un campo con valor en bloque (`|`/`>`): se descartan sus líneas de continuación
  for (const l of lineas) {
    if (sangriaCampo >= 0) {
      if (l.trim() !== '' && sangria(l) > sangriaCampo && !/^\s*-\s/.test(l)) continue
      sangriaCampo = -1
    }
    const m = LINEA_CAMPO.exec(l)
    if (m) {
      const valor = m[3]
      if (valor !== undefined && valor.trim() !== '') {
        if (/^\s*[|>]/.test(valor)) sangriaCampo = sangria(l)
        out.push(`${m[1]}${m[2]}: ${MARCA_VALOR}`)
      } else out.push(`${m[1]}${m[2]}${valor !== undefined ? ':' : ''}`)
      continue
    }
    const suelta = LINEA_CAMPO_SUELTA.exec(l)
    if (suelta) { out.push(`${suelta[1]}: ${MARCA_VALOR}`); continue } // no interpretable: se tapa todo tras el rol
    const u = LINEA_URL.exec(l)
    if (u) { out.push(`${u[1]}${u[2]}`); continue } // sin query ni fragmento (suelen llevar ids/DNI)
    out.push(l)
  }
  let r = redactarDatosPersonales(out.join('\n'))
  for (const f of FECHAS) r = r.replace(f, MARCA_DATO)
  return r
}

/** Recorta a `maxBytes` UTF-8 (sin partir un carácter) y marca el recorte. */
export function recortarBytes(texto: string, maxBytes: number): string {
  if (Buffer.byteLength(texto) <= maxBytes) return texto
  const cola = `\n${MARCA_RECORTE}`
  const corte = Math.max(0, maxBytes - Buffer.byteLength(cola))
  const b = Buffer.from(texto).subarray(0, corte)
  return b.toString('utf8').replace(/\uFFFD+$/, '') + cola
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
    // Se acota ANTES de redactar (coste de los patrones) y DESPUÉS (la marca de recorte cuenta en el tope).
    const acotado = recortarBytes(crudo, maxBytes)
    return recortarBytes(redactarAriaSnapshot(acotado), maxBytes)
  } catch {
    return null
  } finally {
    if (temporizador) clearTimeout(temporizador)
  }
}
