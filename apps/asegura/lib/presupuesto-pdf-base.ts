// Lo COMÚN de los PDF de presupuesto (21/10/2026): texto que cabe en la fuente, partir en líneas, logos, fechas y
// la referencia. Sale de `presupuesto-pdf.ts` para que el cuadro comparativo (`presupuesto-pdf-cuadro.ts`) lo use
// sin un import circular; `presupuesto-pdf.ts` lo re-exporta tal cual.

import { rgb, type PDFFont, type RGB } from 'pdf-lib'
import { LOGOS } from './presupuesto-pdf-recursos.ts'

export function fechaCorta(d: Date): string {
  return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Las dos frases de la referencia: la de la cabecera y la que le pide al cliente que la cite. `null` sin referencia. */
export function textosReferencia(referencia: string | null): { cabecera: string; cita: string } | null {
  if (!referencia) return null
  return {
    cabecera: `Referencia ${referencia}`,
    cita: `Para contratar o preguntarnos por este presupuesto, cita la referencia ${referencia}.`,
  }
}

/** Lo que la fuente no tiene (un emoji) se cambia por «?» en vez de romper el PDF. */
export function paraFuente(font: PDFFont, t: string): string {
  const validos = new Set(font.getCharacterSet())
  const cabe = (c: string) => c === '\n' || validos.has(c.codePointAt(0)!)
  // Una letra con un diacrítico que la fuente no trae (ș, ł, č…) cae a su letra base antes que a «?».
  return Array.from(t.replace(/\r/g, '').replace(/\t/g, ' '))
    .map((c) => (cabe(c) ? c : (() => { const b = c.normalize('NFD')[0] ?? ''; return b && cabe(b) ? b : '?' })()))
    .join('')
}

export function partir(font: PDFFont, texto: string, tam: number, ancho: number): string[] {
  const salida: string[] = []
  for (const parrafo of texto.split('\n')) {
    let linea = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra
      if (font.widthOfTextAtSize(prueba, tam) <= ancho) { linea = prueba; continue }
      if (linea) salida.push(linea)
      linea = palabra
    }
    salida.push(linea)
  }
  return salida
}

/** La clave del logo: la PRIMERA palabra normalizada («Reale Seguros Generales» → reale), como el portal. */
export function claveLogo(compania: string): string | null {
  const k = compania.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().split(/[\s,.]+/)[0]
  return k && LOGOS[k] ? k : null
}

/** Una sola línea: lo que no cabe se corta con «…». */
export function recortar(font: PDFFont, t: string, tam: number, w: number): string {
  let s = paraFuente(font, t)
  if (font.widthOfTextAtSize(s, tam) <= w) return s
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, tam) > w) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

export const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
