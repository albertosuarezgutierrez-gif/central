// lib/sivra/facturas/pdf.ts — PDF de la factura al huésped con `pdf-lib` (la librería que ya usan asegura, rrhh e
// ialimp; JS puro, sin navegador). Helvetica estándar (WinAnsi: tildes, ñ y € sí; emojis no → «?»).
//
// Un BORRADOR sale con la marca «BORRADOR — sin validez fiscal» y sin número: es lo que ve Alberto en Telegram antes de
// pulsar ✅. La emitida se genera UNA vez, se guarda en `sivra_facturas_huesped.pdf` y no se regenera nunca (inmutable).

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { eur } from '../../dinero.ts'
import { lineasEmisor, type Emisor } from './emisor.ts'
import { lineasDireccion, type Receptor } from './receptor.ts'

export type DatosPdf = {
  numeroCompleto: string | null
  fechaExpedicion: string | null // YYYY-MM-DD
  emisor: Emisor
  receptor: Receptor
  concepto: string
  estanciaDesde: string | null // YYYY-MM-DD
  estanciaHasta: string | null
  total: number
  base: number | null
  tipoIva: number | null
  cuota: number | null
  mencionIva: string | null
}

const fechaEs = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')
const porcentaje = (t: number) => `${t.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`

/** Lo que la fuente estándar no sabe pintar se cambia por su letra base o «?» (si no, pdf-lib lanza). */
export function paraFuente(font: PDFFont, t: string): string {
  const validos = new Set(font.getCharacterSet())
  const cabe = (c: string) => validos.has(c.codePointAt(0)!)
  return Array.from((t || '').replace(/[\r\n\t]/g, ' '))
    .map((c) => (cabe(c) ? c : (() => { const b = c.normalize('NFD')[0] ?? ''; return b && cabe(b) ? b : '?' })()))
    .join('')
}

function partir(font: PDFFont, texto: string, tam: number, ancho: number): string[] {
  const out: string[] = []
  let linea = ''
  for (const p of paraFuente(font, texto).split(/\s+/).filter(Boolean)) {
    const prueba = linea ? `${linea} ${p}` : p
    if (font.widthOfTextAtSize(prueba, tam) <= ancho) { linea = prueba; continue }
    if (linea) out.push(linea)
    linea = p
  }
  if (linea) out.push(linea)
  return out
}

export async function generarPdfFactura(d: DatosPdf, opts: { borrador: boolean }): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fecha = d.fechaExpedicion ? new Date(`${d.fechaExpedicion}T12:00:00Z`) : new Date(0)
  doc.setTitle(d.numeroCompleto ? `Factura ${d.numeroCompleto}` : 'Borrador de factura')
  doc.setAuthor(d.emisor.nombre)
  doc.setCreator('plataforma')
  doc.setProducer('plataforma')
  doc.setCreationDate(fecha)
  doc.setModificationDate(fecha)
  const page: PDFPage = doc.addPage([595.28, 841.89]) // A4
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const gris = rgb(0.35, 0.35, 0.35)
  const M = 50
  const W = 595.28 - 2 * M
  let y = 790
  const txt = (t: string, x: number, yy: number, tam = 10, f: PDFFont = normal, color = rgb(0, 0, 0)) =>
    page.drawText(paraFuente(f, t), { x, y: yy, size: tam, font: f, color })
  const derecha = (t: string, xDer: number, yy: number, tam = 10, f: PDFFont = normal) => {
    const s = paraFuente(f, t)
    page.drawText(s, { x: xDer - f.widthOfTextAtSize(s, tam), y: yy, size: tam, font: f })
  }

  if (opts.borrador) {
    page.drawText('BORRADOR', { x: 120, y: 380, size: 90, font: negrita, color: rgb(0.88, 0.88, 0.88), rotate: degrees(35) })
  }

  txt(opts.borrador ? 'BORRADOR DE FACTURA' : 'FACTURA', M, y, 20, negrita)
  derecha(opts.borrador ? 'Sin número · sin validez fiscal' : `Nº ${d.numeroCompleto ?? '—'}`, M + W, y + 4, 11, negrita)
  y -= 18
  derecha(`Fecha de expedición: ${opts.borrador ? '— (al emitir)' : fechaEs(d.fechaExpedicion)}`, M + W, y, 10)
  y -= 34

  // Emisor | Destinatario
  const col = W / 2
  txt('EMISOR', M, y, 9, negrita, gris)
  txt('DESTINATARIO', M + col, y, 9, negrita, gris)
  y -= 14
  const em = lineasEmisor(d.emisor)
  const re = [d.receptor.nombre, `${d.receptor.pais === 'ES' ? 'NIF' : 'Id. fiscal'} ${d.receptor.nif}`, ...lineasDireccion(d.receptor)]
  const filas = Math.max(em.length, re.length)
  for (let i = 0; i < filas; i++) {
    if (em[i]) txt(em[i], M, y, 10, i === 0 ? negrita : normal)
    if (re[i]) {
      for (const [k, l] of partir(i === 0 ? negrita : normal, re[i], 10, col - 10).entries()) {
        txt(l, M + col, y - k * 12, 10, i === 0 ? negrita : normal)
        if (k > 0) y -= 12
      }
    }
    y -= 13
  }
  y -= 20

  // Concepto
  page.drawRectangle({ x: M, y: y - 4, width: W, height: 18, color: rgb(0.93, 0.93, 0.93) })
  txt('Concepto', M + 6, y + 1, 10, negrita)
  derecha('Importe', M + W - 6, y + 1, 10, negrita)
  y -= 22
  const lineasConcepto = partir(normal, d.concepto, 10, W - 120)
  const estancia = d.estanciaDesde && d.estanciaHasta ? `Estancia del ${fechaEs(d.estanciaDesde)} al ${fechaEs(d.estanciaHasta)} (fecha de la operación)` : null
  for (const [i, l] of lineasConcepto.entries()) {
    txt(l, M + 6, y, 10)
    if (i === 0) derecha(d.base !== null ? eur(d.base) : '—', M + W - 6, y, 10)
    y -= 13
  }
  if (estancia) { txt(estancia, M + 6, y, 9, normal, gris); y -= 13 }
  y -= 16

  // Totales
  const filaTotal = (et: string, v: string, f: PDFFont = normal) => {
    derecha(et, M + W - 110, y, 10, f)
    derecha(v, M + W - 6, y, 10, f)
    y -= 15
  }
  filaTotal('Base imponible', d.base !== null ? eur(d.base) : '— (falta el tipo de IVA)')
  filaTotal(`IVA ${d.tipoIva !== null ? porcentaje(d.tipoIva) : '—'}`, d.cuota !== null ? eur(d.cuota) : '—')
  page.drawLine({ start: { x: M + W - 220, y: y + 10 }, end: { x: M + W, y: y + 10 }, thickness: 0.6 })
  filaTotal('TOTAL', eur(d.total), negrita)
  y -= 10
  if (d.mencionIva) {
    for (const l of partir(normal, d.mencionIva, 9, W)) { txt(l, M, y, 9, normal, gris); y -= 12 }
  }
  if (opts.borrador) {
    y -= 6
    txt('Documento de revisión: no es una factura. La factura se emite con número correlativo al aprobarla.', M, y, 9, normal, gris)
  }
  return doc.save({ useObjectStreams: false })
}
