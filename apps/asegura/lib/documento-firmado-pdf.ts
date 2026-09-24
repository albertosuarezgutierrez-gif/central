// El documento firmado en el portal (carta de anulación o de nombramiento de mediador), en PDF para
// mandarlo a la compañía. Un `.txt` suelto se lee como un borrador; un PDF con el justificante de la
// firma debajo es lo que una compañía está acostumbrada a archivar.
//
// 🚨 La huella SHA-256 de la firma es la del TEXTO firmado, no la de este PDF: el PDF es una
// presentación y cambia de bytes con cualquier versión de la librería. Por eso el correo lleva
// también el original en texto, y el propio PDF dice cuál es el fichero que respalda la huella.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'

export type EvidenciaFirma = {
  firmante: string
  /** Cómo firmó: hoy siempre código de un solo uso al correo de su ficha. */
  metodo: string
  /** Instante de la firma (ISO). */
  selloTiempo: string
  /** SHA-256 (hex) del texto firmado, el de `seguros.firma.doc_hash`. */
  docHash: string
  /** Nombre del fichero de texto adjunto cuya huella es `docHash`. */
  ficheroOriginal: string
}

const A4: [number, number] = [595.28, 841.89]
const MARGEN = 56

const METODOS: Record<string, string> = {
  otp_email: 'código de un solo uso enviado al correo electrónico del firmante',
}

function fechaHoraMadrid(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // Año con cuatro cifras a propósito: en un justificante «24/9/26» no vale.
  return d.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) + ' (hora de Madrid)'
}

/** Las líneas del justificante, puras (lo que se pinta debajo de la carta). */
export function lineasJustificante(e: EvidenciaFirma): string[] {
  return [
    'Justificante de firma electrónica',
    `Firmante: ${e.firmante}`,
    `Método: ${METODOS[e.metodo] ?? e.metodo}, con el nombre tecleado por el firmante.`,
    `Fecha y hora: ${fechaHoraMadrid(e.selloTiempo)}`,
    `Huella SHA-256 del texto firmado: ${e.docHash}`,
    `El texto firmado es el del fichero adjunto «${e.ficheroOriginal}»; esa es la huella que se puede comprobar.`,
  ]
}

/** Helvetica solo sabe WinAnsi: lo que no está se cambia por «?» en vez de romper el PDF. */
function paraFuente(font: PDFFont, t: string): string {
  const validos = new Set(font.getCharacterSet())
  return Array.from(t.replace(/\r/g, '')).map((c) => (c === '\n' || validos.has(c.codePointAt(0)!) ? c : '?')).join('')
}

function partirLineas(font: PDFFont, texto: string, tam: number, ancho: number): string[] {
  const salida: string[] = []
  for (const parrafo of texto.replace(/\t/g, ' ').split('\n')) {
    let linea = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra
      if (font.widthOfTextAtSize(prueba, tam) <= ancho) { linea = prueba; continue }
      if (linea) salida.push(linea)
      linea = palabra
      // Una «palabra» más ancha que la línea (la huella) se corta a la fuerza.
      while (font.widthOfTextAtSize(linea, tam) > ancho && linea.length > 1) {
        let n = linea.length - 1
        while (n > 1 && font.widthOfTextAtSize(linea.slice(0, n), tam) > ancho) n--
        salida.push(linea.slice(0, n))
        linea = linea.slice(n)
      }
    }
    salida.push(linea)
  }
  return salida
}

/** La carta tal cual y, debajo, el justificante de la firma. */
export async function pdfDocumentoFirmado(texto: string, evidencia: EvidenciaFirma): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ancho = A4[0] - 2 * MARGEN
  let pagina = pdf.addPage(A4)
  let y = A4[1] - MARGEN

  const escribir = (t: string, font: PDFFont, tam: number, color = rgb(0, 0, 0)) => {
    for (const l of partirLineas(font, paraFuente(font, t), tam, ancho)) {
      if (y < MARGEN + tam) {
        pagina = pdf.addPage(A4)
        y = A4[1] - MARGEN
      }
      pagina.drawText(l, { x: MARGEN, y: y - tam, size: tam, font, color })
      y -= tam * 1.45
    }
  }

  escribir(texto, normal, 11)
  y -= 18
  if (y < MARGEN + 120) {
    pagina = pdf.addPage(A4)
    y = A4[1] - MARGEN
  }
  pagina.drawLine({ start: { x: MARGEN, y }, end: { x: A4[0] - MARGEN, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) })
  y -= 12
  const [titulo, ...resto] = lineasJustificante(evidencia)
  escribir(titulo, negrita, 10)
  for (const l of resto) escribir(l, normal, 9, rgb(0.25, 0.25, 0.25))

  pdf.setTitle(texto.split('\n').find((l) => l.startsWith('Asunto:'))?.slice(7).trim() || 'Documento firmado')
  pdf.setCreator('Grupo ASegura')
  return pdf.save()
}
