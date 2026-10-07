// Pinta el `ModeloPropuesta` en PDF con la vía de la casa (pdf-lib + fuentes/logo de `presupuesto-pdf-recursos`).
// Sin lógica de negocio: todo el texto viene ya decidido por `construirPropuesta`. No envía nada.
import { PDFDocument, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { LOGOTIPO, NUNITO_400, NUNITO_700, QUICKSAND_700 } from './presupuesto-pdf-recursos.ts'
import { fechaCorta, hex, paraFuente, partir, recortar, textosReferencia } from './presupuesto-pdf.ts'
import type { ColumnaPropuesta, ModeloPropuesta } from './propuesta-comercial.ts'

const A4: [number, number] = [595.28, 841.89]
const M = 44
const PRIMARIO = hex('#3364ee')
const SUAVE = hex('#E3EFFF')
const TEXTO = hex('#161616')
const TENUE = hex('#6B6B6B')
const BORDE = hex('#E4E4E4')
const VERDE = hex('#15803D')
const VERDE_SUAVE = hex('#E7F6EC')
const AMBAR = hex('#9A6700')
const AMBAR_SUAVE = hex('#FFF4D6')
const PIE = 46
const MAX_COLUMNAS = 4

export async function pdfPropuesta(m: ModeloPropuesta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const titulo: PDFFont = await pdf.embedFont(Buffer.from(QUICKSAND_700, 'base64'), { subset: true })
  const normal: PDFFont = await pdf.embedFont(Buffer.from(NUNITO_400, 'base64'), { subset: true })
  const negrita: PDFFont = await pdf.embedFont(Buffer.from(NUNITO_700, 'base64'), { subset: true })
  const logotipo = await pdf.embedPng(Buffer.from(LOGOTIPO, 'base64'))

  const ancho = A4[0] - 2 * M
  let pagina: PDFPage = pdf.addPage(A4)
  let y = A4[1] - M
  const cabe = (alto: number) => { if (y - alto < M + PIE) { pagina = pdf.addPage(A4); y = A4[1] - M } }
  const texto = (t: string, x: number, yy: number, font: PDFFont, tam: number, color: RGB = TEXTO) =>
    pagina.drawText(paraFuente(font, t), { x, y: yy, size: tam, font, color })
  const parrafo = (t: string, font: PDFFont, tam: number, color: RGB = TEXTO, x = M, w = ancho) => {
    for (const l of partir(font, paraFuente(font, t), tam, w)) { cabe(tam * 1.4); texto(l, x, y - tam, font, tam, color); y -= tam * 1.4 }
  }
  const encabezado = (t: string, tam = 13) => { cabe(tam + 40); texto(t, M, y - tam, titulo, tam); y -= tam + 10 }

  // Portada
  const altoLogo = 26
  pagina.drawImage(logotipo, { x: M, y: y - altoLogo, width: (logotipo.width / logotipo.height) * altoLogo, height: altoLogo })
  const ref = textosReferencia(m.referencia)
  const der = `Propuesta · ${fechaCorta(m.fecha)}`
  texto(der, A4[0] - M - normal.widthOfTextAtSize(der, 8.5), y - 10, normal, 8.5, TENUE)
  if (ref) texto(ref.cabecera, A4[0] - M - negrita.widthOfTextAtSize(ref.cabecera, 8.5), y - 22, negrita, 8.5, PRIMARIO)
  y -= altoLogo + 22
  texto(m.titulo, M, y - 20, titulo, 20, PRIMARIO); y -= 30
  texto(`Preparada para ${m.cliente}`, M, y - 11, normal, 11, TENUE); y -= 26
  parrafo(m.introduccion, normal, 10)
  y -= 10

  // Recomendación (solo si alguien la ha indicado)
  if (m.recomendacion) {
    const lineas = m.recomendacion.motivos.flatMap((mo) => partir(normal, paraFuente(normal, `• ${mo}`), 9.5, ancho - 24))
    const alto = 34 + lineas.length * 13
    cabe(alto + 10)
    pagina.drawRectangle({ x: M, y: y - alto, width: ancho, height: alto, color: VERDE_SUAVE })
    texto(`Nuestra recomendación: ${m.recomendacion.compania}`, M + 12, y - 20, titulo, 12, VERDE)
    lineas.forEach((l, k) => texto(l, M + 12, y - 36 - k * 13, normal, 9.5))
    y -= alto + 14
  }

  // Cuadro comparativo: hasta MAX_COLUMNAS compañías por tabla; el orden de entrada se respeta.
  encabezado('Comparativa (precios por año)')
  const idx = m.columnas.map((_, i) => i)
  for (let ini = 0; ini < idx.length; ini += MAX_COLUMNAS) {
    const trozo = idx.slice(ini, ini + MAX_COLUMNAS)
    const colEtiq = 128
    const colW = (ancho - colEtiq) / trozo.length
    const cols: ColumnaPropuesta[] = trozo.map((i) => m.columnas[i])
    // cabecera
    cabe(60)
    const altoCab = 40
    pagina.drawRectangle({ x: M, y: y - altoCab, width: ancho, height: altoCab, color: SUAVE })
    cols.forEach((c, k) => {
      const x = M + colEtiq + k * colW
      texto(recortar(negrita, c.compania, 9, colW - 8), x + 4, y - 14, negrita, 9, c.recomendada ? VERDE : PRIMARIO)
      texto(recortar(normal, c.producto, 7.5, colW - 8), x + 4, y - 25, normal, 7.5, TENUE)
      texto(c.primaAnual, x + 4, y - 36, titulo, 10.5, c.primaAnualEur === null ? AMBAR : TEXTO)
    })
    texto('Prima anual', M + 4, y - 36, titulo, 10.5)
    y -= altoCab
    for (const f of m.filas) {
      const celdas = trozo.map((i) => partir(normal, paraFuente(normal, f.celdas[i] ?? ''), 8, colW - 8))
      const etiq = partir(normal, paraFuente(normal, f.etiqueta), 8, colEtiq - 8)
      const alto = Math.max(etiq.length, ...celdas.map((c) => c.length)) * 10 + 8
      cabe(alto)
      pagina.drawRectangle({ x: M, y: y - alto, width: ancho, height: 0.5, color: BORDE })
      etiq.forEach((l, k) => texto(l, M + 4, y - 11 - k * 10, negrita, 8))
      celdas.forEach((ls, k) => ls.forEach((l, j) => {
        const sinDato = l === 'No consta'
        texto(l, M + colEtiq + k * colW + 4, y - 11 - j * 10, normal, 8, sinDato ? AMBAR : TEXTO)
      }))
      y -= alto
    }
    y -= 16
  }

  // Avisos
  if (m.avisos.length) {
    const lineas = m.avisos.flatMap((a) => partir(normal, paraFuente(normal, `• ${a}`), 8.5, ancho - 20))
    const alto = 28 + lineas.length * 11.5
    cabe(alto + 8)
    pagina.drawRectangle({ x: M, y: y - alto, width: ancho, height: alto, color: AMBAR_SUAVE })
    texto('Ten en cuenta', M + 10, y - 17, titulo, 10, AMBAR)
    lineas.forEach((l, k) => texto(l, M + 10, y - 32 - k * 11.5, normal, 8.5))
    y -= alto + 14
  }

  // Aviso orientativo + mediador
  cabe(110)
  texto('Aviso importante', M, y - 10, titulo, 10); y -= 16
  parrafo(m.avisoOrientativo, normal, 8, TENUE)
  y -= 8
  texto('Tu mediador', M, y - 10, titulo, 10); y -= 16
  parrafo(`${m.pieLegal} · ${m.mediador.email}`, normal, 8, TENUE)

  // Pie en todas las páginas
  const paginas = pdf.getPages()
  paginas.forEach((pg, n) => {
    pg.drawRectangle({ x: M, y: M + 22, width: ancho, height: 0.6, color: BORDE })
    partir(normal, paraFuente(normal, m.pieLegal), 7, ancho - 40).forEach((l, k) => pg.drawText(l, { x: M, y: M + 12 - k * 9, size: 7, font: normal, color: TENUE }))
    const num = `${n + 1}/${paginas.length}`
    pg.drawText(num, { x: A4[0] - M - normal.widthOfTextAtSize(num, 7), y: M + 12, size: 7, font: normal, color: TENUE })
  })
  pdf.setTitle(`${m.titulo} — ${m.cliente}`)
  pdf.setCreator(m.mediador.marca)
  return pdf.save()
}
