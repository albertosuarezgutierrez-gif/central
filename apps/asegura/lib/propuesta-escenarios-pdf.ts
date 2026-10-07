// Pinta la PROPUESTA DE ESCENARIOS en PDF (07/10/2026) con la vía de la casa (pdf-lib + fuentes/logo de
// `presupuesto-pdf-recursos`). Sin lógica de negocio: etiquetas, orden y «la más económica» ya vienen decididos
// por `ordenarEscenarios` (module-seguros) a través de `leerPropuesta`. No envía nada: descargar ≠ comunicar.
// Del cliente solo el nombre; nada de DNI (la etiqueta lleva nombres de pila), teléfono, correo ni dirección.
import { PDFDocument, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { MEDIADOR } from '@central/module-seguros'
import { eur } from './dinero.ts'
import { LOGOTIPO, NUNITO_400, NUNITO_700, QUICKSAND_700 } from './presupuesto-pdf-recursos.ts'
import { fechaCorta, hex, paraFuente, partir, recortar } from './presupuesto-pdf.ts'
import { AVISO_ORIENTATIVO } from './propuesta-comercial.ts'
import type { VistaPropuesta } from './propuesta-escenarios.ts'

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
const PIE = 46

const RAMOS: Record<string, string> = { auto: 'coche', moto: 'moto', hogar: 'hogar', vida: 'vida', decesos: 'decesos', salud: 'salud' }

export function nombreFicheroPropuesta(v: Pick<VistaPropuesta, 'referencia' | 'cliente' | 'creadoAt'>): string {
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `propuesta-${limpio(v.referencia)}-${limpio(v.cliente) || 'cliente'}-${v.creadoAt.slice(0, 10)}.pdf`
}

export async function pdfPropuestaEscenarios(v: VistaPropuesta): Promise<Uint8Array> {
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

  // Cabecera
  const altoLogo = 26
  pagina.drawImage(logotipo, { x: M, y: y - altoLogo, width: (logotipo.width / logotipo.height) * altoLogo, height: altoLogo })
  const der = `Propuesta · ${fechaCorta(new Date(v.creadoAt))}`
  texto(der, A4[0] - M - normal.widthOfTextAtSize(der, 8.5), y - 10, normal, 8.5, TENUE)
  const ref = `Referencia ${v.referencia}`
  texto(ref, A4[0] - M - negrita.widthOfTextAtSize(ref, 8.5), y - 22, negrita, 8.5, PRIMARIO)
  y -= altoLogo + 22
  texto(`${v.ramo ? `Tu seguro de ${RAMOS[v.ramo] ?? v.ramo}` : 'Tu seguro (sin ramo)'}: ${v.escenarios.length} escenarios`, M, y - 20, titulo, 20, PRIMARIO); y -= 30
  texto(`Preparada para ${v.cliente}`, M, y - 11, normal, 11, TENUE); y -= 26
  parrafo(
    'En cada escenario cambia quién figura como tomador, conductor o propietario, y con ello el precio. Van ordenados ' +
    'del más económico al más caro; las primas son anuales. Para contratar uno, cita su referencia o la de esta propuesta.',
    normal, 10,
  )
  y -= 10

  for (const e of v.escenarios) {
    // Cabecera del bloque
    const etiq = partir(negrita, paraFuente(negrita, e.etiqueta), 10, ancho - 24)
    const altoCab = 30 + etiq.length * 13
    cabe(altoCab + 60)
    pagina.drawRectangle({ x: M, y: y - altoCab, width: ancho, height: altoCab, color: e.masEconomica ? VERDE_SUAVE : SUAVE })
    const tituloBloque = `Escenario ${e.numero}${e.referencia ? ` · ${e.referencia}` : ''}`
    texto(tituloBloque, M + 12, y - 18, titulo, 12, e.masEconomica ? VERDE : PRIMARIO)
    if (e.masEconomica) {
      const marca = 'La más económica'
      texto(marca, A4[0] - M - 12 - titulo.widthOfTextAtSize(marca, 10), y - 18, titulo, 10, VERDE)
    }
    etiq.forEach((l, k) => texto(l, M + 12, y - 33 - k * 13, negrita, 10))
    y -= altoCab + 6
    parrafo(e.seguroAnterior, normal, 8.5, TENUE, M + 12, ancho - 24)
    y -= 4

    if (e.opciones.length === 0) {
      parrafo('Este presupuesto no tiene opciones visibles.', normal, 9, AMBAR, M + 12, ancho - 24)
    }
    for (const o of e.opciones) {
      const prima = eur(o.primaEur)
      const nombre = [o.compania, o.producto, o.modalidad].filter((s): s is string => typeof s === 'string' && s.trim() !== '').join(' · ')
      const cob = o.coberturas.length ? `Coberturas clave: ${o.coberturas.join(', ')}` : 'Coberturas: no constan en el presupuesto'
      const lineasCob = partir(normal, paraFuente(normal, cob), 8, ancho - 140)
      const alto = 16 + lineasCob.length * 10 + 6
      cabe(alto)
      pagina.drawRectangle({ x: M + 12, y: y - alto, width: ancho - 24, height: 0.5, color: BORDE })
      texto(recortar(negrita, nombre, 9.5, ancho - 150), M + 12, y - 13, negrita, 9.5)
      const anual = `${prima} /año`
      texto(anual, A4[0] - M - 12 - titulo.widthOfTextAtSize(anual, 10.5), y - 13, titulo, 10.5, o.primaEur === null ? AMBAR : TEXTO)
      lineasCob.forEach((l, k) => texto(l, M + 12, y - 25 - k * 10, normal, 8, TENUE))
      y -= alto
    }
    y -= 16
  }

  // Aviso orientativo + mediador
  const pieLegal = `${MEDIADOR.marca} · ${MEDIADOR.identidad.nombre}, corredor de seguros · Clave DGSFP ${MEDIADOR.identidad.claveDgsfp} · ${MEDIADOR.identidad.domicilio}`
  cabe(110)
  texto('Aviso importante', M, y - 10, titulo, 10); y -= 16
  parrafo(AVISO_ORIENTATIVO, normal, 8, TENUE)
  y -= 8
  texto('Tu mediador', M, y - 10, titulo, 10); y -= 16
  parrafo(MEDIADOR.identidad.email ? `${pieLegal} · ${MEDIADOR.identidad.email}` : pieLegal, normal, 8, TENUE)

  const paginas = pdf.getPages()
  paginas.forEach((pg, n) => {
    pg.drawRectangle({ x: M, y: M + 22, width: ancho, height: 0.6, color: BORDE })
    partir(normal, paraFuente(normal, pieLegal), 7, ancho - 40).forEach((l, k) => pg.drawText(l, { x: M, y: M + 12 - k * 9, size: 7, font: normal, color: TENUE }))
    const num = `${n + 1}/${paginas.length}`
    pg.drawText(num, { x: A4[0] - M - normal.widthOfTextAtSize(num, 7), y: M + 12, size: 7, font: normal, color: TENUE })
  })
  pdf.setTitle(`Propuesta ${v.referencia} — ${v.cliente}`)
  pdf.setCreator(MEDIADOR.marca)
  return pdf.save()
}
