// lib/correo/pdf-filas.ts — Texto de un PDF POR FILAS, con las celdas de una tabla separadas por tabulador.
//
// `pdf-parse` a secas pega las columnas: la carta de Allianz sale como «10436736556074392821234Jaenes»
// (nº de orden + póliza + recibo + ramo + tomador sin separar), y eso no se puede partir sin adivinar.
// Aquí se agrupan los trozos por su altura en la página y, dentro de una fila, un hueco horizontal
// grande es un cambio de celda (`\t`) y uno pequeño un espacio.

type Trozo = { x: number; w: number; s: string }

/** Puntos de altura dentro de los que dos trozos son la misma línea (el texto va a 10-12 pt). */
const TOLERANCIA_Y = 2

/** PURO: los trozos de UNA página (x, y, ancho, texto) → líneas. Exportado para el test. */
export function filasDeTrozos(items: { x: number; y: number; w: number; s: string }[]): string[] {
  // Misma fila si la altura difiere en menos de TOLERANCIA_Y (redondear partiría 400,4 y 400,6).
  const filas: { y: number; trozos: Trozo[] }[] = []
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const ultima = filas[filas.length - 1]
    if (ultima && ultima.y - it.y <= TOLERANCIA_Y) ultima.trozos.push({ x: it.x, w: it.w, s: it.s })
    else filas.push({ y: it.y, trozos: [{ x: it.x, w: it.w, s: it.s }] })
  }
  return filas.map(({ trozos }) => {
    let out = ''
    let fin: number | null = null
    for (const t of trozos.sort((a, b) => a.x - b.x)) {
      if (fin !== null) {
        const hueco = t.x - fin
        out += hueco > 8 ? '\t' : hueco > 1.5 ? ' ' : ''
      }
      out += t.s
      fin = t.x + t.w
    }
    return out
  })
}

/** Texto por filas de un PDF. `null` si no se ha podido leer (no se confunde con un PDF sin texto: ''). */
export async function textoPdfPorFilas(buf: Buffer): Promise<string | null> {
  try {
    // Import perezoso del implementador interno (mismo patrón que `lib/subastas/documentos.ts`).
    const mod: any = await import('pdf-parse/lib/pdf-parse.js')
    const pdfParse = mod.default ?? mod
    const { text } = await pdfParse(buf, {
      pagerender: async (pagina: any) => {
        const tc = await pagina.getTextContent()
        return filasDeTrozos(tc.items.map((it: any) => ({ x: it.transform[4], y: it.transform[5], w: it.width ?? 0, s: String(it.str ?? '') }))).join('\n')
      },
    })
    return String(text ?? '')
  } catch {
    return null
  }
}
