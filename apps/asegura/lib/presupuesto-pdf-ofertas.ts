// El estudio comparativo en PDF para un presupuesto de origen `ofertas` (05/10/2026, F4).
//
// PURO (sin BD): recibe el `estudio` congelado del presupuesto (`compararOfertas` + narrativa validada),
// no recalcula nada. Reutiliza los recursos de marca de `presupuesto-pdf.ts` (Quicksand + Nunito Sans,
// cobalto #3364ee, logotipo, logos de compañía) y el mismo pie de mediador.
//
// 🚨 `null` = «No figura» (el dato no consta en el documento de la compañía), NUNCA «no cubre» ni 0.
// 🚨 Sin ranking inventado: lo único que se destaca es la oferta que el CORREDOR marcó como recomendada (el orden
//    por prima de `compararOfertas.ranking` es para el corredor, en plataforma; al cliente no se le enseña).
// 🏷️ El análisis lleva su etiqueta visible (`etiquetaResumen`): «Resumen preparado con IA y revisado por tu corredor».
// 🚨 Lleva el nombre de la compañía y las cifras de los documentos que ELLAS emitieron; no lleva la
//    evidencia literal (páginas/trozos del PDF), ni notas de revisión, ni la ruta de ningún fichero.

import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { textoOpcionesComparadas, type FilaMatriz, type OfertaNormalizada, type ResumenOferta } from '@central/module-seguros'
import { eur } from './dinero.ts'
import { LOGOS, LOGOTIPO, NUNITO_400, NUNITO_700, QUICKSAND_700 } from './presupuesto-pdf-recursos.ts'
import { claveLogo, fechaCorta, hex, paraFuente, partir, recortar, textosReferencia } from './presupuesto-pdf-base.ts'
import { cabecerasColumnas, NO_FIGURA, pintarAnalisis, pintarCuadroComparativo, pintarLlamadaAccion, textoPrimaOferta, type EstudioPdf, type LienzoPdf } from './presupuesto-pdf-cuadro.ts'

// Lo que se movió al cuadro común (21/10/2026) se re-exporta: los consumidores y tests lo siguen importando de aquí.
export { filasParaColumnas, leerEstudio, NO_FIGURA, repartirColumnas, textoCelda, textoFuenteCuadro, textoPrimaOferta, cabecerasColumnas } from './presupuesto-pdf-cuadro.ts'
export type { EstudioPdf, MarcaCeldaPdf, NarrativaPdf } from './presupuesto-pdf-cuadro.ts'

// ─── Datos ───────────────────────────────────────────────────────────────────

export type DatosPdfOfertas = {
  referencia: string | null
  cliente: string
  ramo: string
  creadoAt: Date
  venceEl: Date
  necesidades: string | null
  estudio: EstudioPdf
  mediador: { marca: string; nombre: string; claveDgsfp: string; domicilio: string; email: string | null; telefono?: string | null }
}

const RAMOS_TXT: Record<string, string> = {
  comunidades: 'comunidad de propietarios', comercio: 'comercio', hogar: 'hogar', generico: 'seguro',
  auto: 'coche', moto: 'moto', vida: 'vida', decesos: 'decesos', salud: 'salud', pymes: 'comercio',
}
const ramoTxt = (ramo: string): string => RAMOS_TXT[ramo] ?? ramo

// ─── Lógica de vista (pura, con test) ────────────────────────────────────────

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const pctEs = (n: number): string => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: 'always' }) + '%'
const entEs = (n: number): string => n.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })

/** Las garantías que la oferta INCLUYE con cifra o sin ella, en el orden del cuadro y como «Etiqueta: 200.000,00€». */
export function garantiasClave(filas: readonly FilaMatriz[], ofertaId: string, max: number): string[] {
  const out: string[] = []
  for (const f of filas) {
    const c = f.celdas.find((x) => x.ofertaId === ofertaId)
    const v = c?.valor
    if (!c || !c.consta || !v || v.estado === 'excluida') continue
    const cifra = num(v.capital) ? eur(v.capital) : num(v.limite) ? `límite ${eur(v.limite)}` : null
    if (v.estado !== 'incluida' && cifra === null) continue
    out.push(cifra ? `${f.etiqueta}: ${cifra}` : f.etiqueta)
    if (out.length >= max) break
  }
  return out
}

/** «90,40€ más al año que tu póliza actual (+5,2%)». `null` cuando no hay base de comparación. */
export function textoDelta(r: Pick<ResumenOferta, 'deltaPrimaEur' | 'deltaPrimaPct'>): string | null {
  if (!num(r.deltaPrimaEur)) return null
  const pct = num(r.deltaPrimaPct) ? ` (${r.deltaPrimaPct > 0 ? '+' : r.deltaPrimaPct < 0 ? '-' : ''}${pctEs(Math.abs(r.deltaPrimaPct))})` : ''
  if (r.deltaPrimaEur === 0) return 'Misma prima anual que tu póliza actual'
  return `${eur(Math.abs(r.deltaPrimaEur))} ${r.deltaPrimaEur > 0 ? 'más' : 'menos'} al año que tu póliza actual${pct}`
}

/** Las líneas de hechos de una oferta frente a la actual (sin adjetivos: lo que cuenta el comparador). */
const FRACCIONAMIENTO_TXT: Record<string, string> = { anual: 'anual', semestral: 'semestral', trimestral: 'trimestral', mensual: 'mensual' }

export function lineasResumen(r: ResumenOferta, hayActual: boolean): string[] {
  const l: string[] = []
  const general = num(r.franquiciaGeneral) ? r.franquiciaGeneral : null
  if (general !== null) l.push(`Franquicia general: ${eur(general)}`)
  if (r.franquiciaMaxima !== null) l.push(`Franquicia máxima declarada: ${eur(r.franquiciaMaxima)}`)
  // Ni general ni por garantía: «no figura», nunca «sin franquicia».
  if (general === null && r.franquiciaMaxima === null) l.push('Franquicia: no figura en la oferta')
  if (r.fraccionamiento && FRACCIONAMIENTO_TXT[r.fraccionamiento]) l.push(`Forma de pago: ${FRACCIONAMIENTO_TXT[r.fraccionamiento]}`)
  if (hayActual && r.rol !== 'actual') {
    l.push(`${r.garantiasMejor} ${r.garantiasMejor === 1 ? 'garantía con más cobertura' : 'garantías con más cobertura'} que la actual`)
    l.push(`${r.garantiasPeor} ${r.garantiasPeor === 1 ? 'garantía con menos cobertura' : 'garantías con menos cobertura'} que la actual`)
    if (r.huecos > 0) l.push(`${r.huecos} ${r.huecos === 1 ? 'garantía de la actual no figura' : 'garantías de la actual no figuran'} en esta oferta`)
  }
  return l
}

export function textoInfraseguro(a: NonNullable<ResumenOferta['infraseguroContinente']>): string {
  return `Posible infraseguro del continente: ${eur(a.capital)} para ${entEs(a.superficieM2)} m² son ${eur(a.eurPorM2)}/m², por debajo ` +
    `de la referencia orientativa de ${eur(a.umbral)}/m². Si el valor real de reconstrucción es mayor, puede aplicarse la regla proporcional.`
}

export const AVISO_LEGAL_OFERTAS =
  'Este documento es un análisis objetivo de las ofertas recibidas, elaborado conforme a la obligación de asesoramiento ' +
  'del Real Decreto-ley 3/2020 sobre distribución de seguros' +
  '. Los datos de cada oferta (primas, capitales, límites y franquicias) ' +
  'han sido facilitados por las propias compañías en sus documentos y pueden variar al contratar. «No figura» significa que el dato ' +
  'no consta en el documento de la compañía, no que la garantía no esté cubierta. No sustituye a la póliza ni a sus condiciones ' +
  'generales, particulares y especiales, que son las únicas que obligan al asegurador: el seguro empieza cuando la compañía emite la póliza.'

/**
 * «Resumen por oferta» enseña SOLO lo que difiere (21/10/2026: seis tarjetas repetían «Franquicia: no figura»): lo que
 * está en TODAS las listas sale una vez como común, y cada oferta se queda con lo suyo. Con una sola oferta no hay
 * nada «común». Conserva el orden de cada lista. PURO.
 */
export function separarComunes(listas: readonly (readonly string[])[]): { comunes: string[]; propias: string[][] } {
  if (listas.length < 2) return { comunes: [], propias: listas.map((l) => [...l]) }
  const comunes = [...new Set(listas[0])].filter((x) => listas.every((l) => l.includes(x)))
  return { comunes, propias: listas.map((l) => l.filter((x) => !comunes.includes(x))) }
}

/**
 * El aviso legal según de dónde salen los precios: «facilitados por las propias compañías en sus documentos» no vale
 * para un precio estimado de Avant2 (lo calcula la compañía con los datos del cliente y puede variar al contratar).
 */
export function avisoLegalOfertas(ofertas: readonly Pick<OfertaNormalizada, 'rol' | 'fuente'>[]): string {
  const candidatas = ofertas.filter((o) => o.rol !== 'actual')
  const deAvant2 = candidatas.filter((o) => o.fuente === 'avant2').length
  if (deAvant2 === 0) return AVISO_LEGAL_OFERTAS
  const datos = deAvant2 === candidatas.length
    ? 'Los precios son ESTIMADOS: cada compañía los calcula con los datos que nos has dado y los confirma al emitir, así que pueden variar al contratar. Las coberturas son las de la ficha de cada producto. '
    : 'Los datos de cada oferta los han facilitado las propias compañías en sus documentos, salvo los precios marcados como estimados, que cada compañía calcula con tus datos y confirma al emitir: pueden variar al contratar. '
  const texto = AVISO_LEGAL_OFERTAS.replace(/\. Los datos de cada oferta[^.]*\. /, '. ' + datos)
  return deAvant2 === candidatas.length ? texto.replace('no consta en el documento de la compañía', 'la compañía no lo indica') : texto
}

export function nombreFicheroOfertas(d: Pick<DatosPdfOfertas, 'cliente' | 'ramo' | 'creadoAt' | 'referencia'>): string {
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const ref = d.referencia ? `${limpio(d.referencia)}-` : ''
  return `estudio-${ref}${limpio(ramoTxt(d.ramo))}-${limpio(d.cliente) || 'cliente'}-${d.creadoAt.toISOString().slice(0, 10)}.pdf`
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const A4: [number, number] = [595.28, 841.89]
const M = 44
const PRIMARIO = hex('#3364ee')
const SUAVE = hex('#E3EFFF')
const TEXTO = hex('#161616')
const TENUE = hex('#6B6B6B')
const BORDE = hex('#E4E4E4')
const VERDE = hex('#15803D')
const VERDE_SUAVE = hex('#E7F6EC')
const ROJO = hex('#B42318')
const ROJO_SUAVE = hex('#FDECEA')
const AMBAR = hex('#9A6700')
const AMBAR_SUAVE = hex('#FFF4D6')
const PIE = 46

type Fuentes = { titulo: PDFFont; normal: PDFFont; negrita: PDFFont }

export async function pdfEstudioOfertas(d: DatosPdfOfertas): Promise<Uint8Array> {
  const { comparacion: cmp, narrativa, recomendadaId, actualId } = d.estudio
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const f: Fuentes = {
    titulo: await pdf.embedFont(Buffer.from(QUICKSAND_700, 'base64'), { subset: true }),
    normal: await pdf.embedFont(Buffer.from(NUNITO_400, 'base64'), { subset: true }),
    negrita: await pdf.embedFont(Buffer.from(NUNITO_700, 'base64'), { subset: true }),
  }
  const logotipo = await pdf.embedPng(Buffer.from(LOGOTIPO, 'base64'))
  const logos = new Map<string, PDFImage>()
  const logoDe = async (compania: string): Promise<PDFImage | null> => {
    const k = claveLogo(compania)
    if (!k) return null
    if (!logos.has(k)) logos.set(k, await pdf.embedPng(Buffer.from(LOGOS[k], 'base64')))
    return logos.get(k)!
  }

  const ancho = A4[0] - 2 * M
  let pagina: PDFPage = pdf.addPage(A4)
  let y = A4[1] - M
  const nuevaPagina = () => { pagina = pdf.addPage(A4); y = A4[1] - M }
  const cabe = (alto: number) => { if (y - alto < M + PIE) nuevaPagina() }
  const linea = (t: string, x: number, yy: number, font: PDFFont, tam: number, color: RGB = TEXTO) =>
    pagina.drawText(paraFuente(font, t), { x, y: yy, size: tam, font, color })
  const parrafo = (t: string, font: PDFFont, tam: number, color: RGB = TEXTO, x = M, w = ancho, interlinea = 1.4) => {
    for (const l of partir(font, paraFuente(font, t), tam, w)) {
      cabe(tam * interlinea)
      linea(l, x, y - tam, font, tam, color)
      y -= tam * interlinea
    }
  }
  const titulo = (t: string, tam = 14, siguiente = 40) => {
    cabe(tam + 12 + siguiente)
    linea(t, M, y - tam, f.titulo, tam)
    y -= tam + 12
  }
  const chip = (t: string, x: number, yy: number, fondo: RGB, color: RGB): number => {
    const tam = 7.5
    const w = f.negrita.widthOfTextAtSize(paraFuente(f.negrita, t), tam) + 10
    pagina.drawRectangle({ x, y: yy - 3.5, width: w, height: tam + 6, color: fondo })
    linea(t, x + 5, yy, f.negrita, tam, color)
    return w
  }
  const logoOInicial = async (compania: string, x: number, yTop: number, colW: number) => {
    const img = await logoDe(compania)
    if (img) {
      const h = Math.min(24, (colW * img.height) / img.width)
      pagina.drawImage(img, { x, y: yTop - h, width: (img.width / img.height) * h, height: h })
    } else {
      pagina.drawCircle({ x: x + 12, y: yTop - 12, size: 12, color: SUAVE })
      const ini = compania.trim().charAt(0).toUpperCase() || '?'
      linea(ini, x + 12 - f.titulo.widthOfTextAtSize(paraFuente(f.titulo, ini), 11) / 2, yTop - 16, f.titulo, 11, PRIMARIO)
    }
  }

  const actual = cmp.ofertas.find((o) => o.id === actualId) ?? cmp.ofertas.find((o) => o.rol === 'actual') ?? null
  const ofertas = cmp.ofertas.filter((o) => o.id !== actual?.id)
  const resumenDe = (id: string) => cmp.resumen.find((r) => r.ofertaId === id) ?? null
  // El MISMO nombre que las cabeceras del cuadro: compañía y, si hace falta para distinguirla, su nivel.
  const nombres = cabecerasColumnas(cmp.ofertas)
  const marcaDe = (o: OfertaNormalizada) => (nombres.get(o.id) ?? o.compania).replace(/ \(tu póliza actual\)$/, '')
  // El cuadro y el análisis son comunes con el PDF de Avant2 (`presupuesto-pdf-cuadro.ts`): pintan sobre la página y la
  // `y` vivas de este PDF.
  const lienzo: LienzoPdf = {
    f, ancho,
    get pagina() { return pagina },
    get y() { return y },
    set y(v: number) { y = v },
    nuevaPagina, cabe, linea, chip,
    parrafo: (t, font, tam, color) => parrafo(t, font, tam, color),
  }

  // ── Portada ──
  const altoLogo = 26
  pagina.drawImage(logotipo, { x: M, y: y - altoLogo, width: (logotipo.width / logotipo.height) * altoLogo, height: altoLogo })
  const ref = textosReferencia(d.referencia)
  const fechaTxt = `Estudio comparativo · ${fechaCorta(d.creadoAt)}`
  if (ref) {
    linea(ref.cabecera, A4[0] - M - f.negrita.widthOfTextAtSize(paraFuente(f.negrita, ref.cabecera), 11), y - 9, f.negrita, 11, PRIMARIO)
    linea(fechaTxt, A4[0] - M - f.normal.widthOfTextAtSize(fechaTxt, 9), y - 23, f.normal, 9, TENUE)
  } else {
    linea(fechaTxt, A4[0] - M - f.normal.widthOfTextAtSize(fechaTxt, 9), y - 17, f.normal, 9, TENUE)
  }
  y -= altoLogo + 12
  pagina.drawRectangle({ x: M, y, width: ancho, height: 2, color: PRIMARIO })
  y -= 28
  for (const l of partir(f.titulo, `Estudio comparativo de tu seguro de ${ramoTxt(d.ramo)}`, 20, ancho)) {
    linea(l, M, y - 20, f.titulo, 20)
    y -= 26
  }
  y -= 4
  parrafo(`Para ${d.cliente}`, f.negrita, 11, TEXTO, M, ancho, 1.5)
  y -= 8

  // Ficha del riesgo y del estudio.
  const filasFicha: [string, string][] = [
    ['Riesgo', ramoTxt(d.ramo).replace(/^./, (c) => c.toUpperCase()) + (cmp.superficieM2 !== null ? ` · ${entEs(cmp.superficieM2)} m²` : '')],
    ['Fecha del estudio', fechaCorta(d.creadoAt)],
    ['Precios válidos hasta', fechaCorta(d.venceEl)],
    ['Ofertas comparadas', textoOpcionesComparadas(cmp.ofertas)],
  ]
  if (d.referencia) filasFicha.push(['Referencia', d.referencia])
  {
    const pad = 14
    const alto = pad * 2 + filasFicha.length * 15
    cabe(alto + 12)
    const arriba = y
    pagina.drawRectangle({ x: M, y: arriba - alto, width: ancho, height: alto, color: SUAVE })
    filasFicha.forEach(([k, v], i) => {
      linea(`${k}:`, M + pad, arriba - pad - 10 - i * 15, f.normal, 9.5, TENUE)
      linea(v, M + pad + 130, arriba - pad - 10 - i * 15, f.negrita, 9.5)
    })
    y = arriba - alto - 14
  }
  if (ref) { parrafo(ref.cita, f.negrita, 9.5, PRIMARIO); y -= 6 }

  // ── Situación actual ──
  if (actual) {
    titulo('Tu situación actual', 14, 90)
    const pad = 12
    const clave = garantiasClave(cmp.filas, actual.id, 8)
    const txtClave = clave.length ? clave.join(' · ') : 'No constan garantías con cifra en el documento de tu póliza.'
    const lineas = partir(f.normal, paraFuente(f.normal, txtClave), 8.5, ancho - pad * 2)
    const alto = pad * 2 + 30 + 10 + lineas.length * 11.5
    cabe(alto + 8)
    const arriba = y
    pagina.drawRectangle({ x: M, y: arriba - alto, width: ancho, height: alto, color: rgb(1, 1, 1), borderColor: BORDE, borderWidth: 0.8 })
    await logoOInicial(actual.compania, M + pad, arriba - pad, 70)
    const x2 = M + pad + 84
    linea(recortar(f.titulo, marcaDe(actual), 11.5, ancho - pad * 2 - 84 - 110), x2, arriba - pad - 11, f.titulo, 11.5)
    const prima = actual.primaTotal === null ? NO_FIGURA : eur(actual.primaTotal)
    const wp = f.titulo.widthOfTextAtSize(paraFuente(f.titulo, prima), 15)
    linea(prima, A4[0] - M - pad - wp, arriba - pad - 14, f.titulo, 15, PRIMARIO)
    const al = actual.primaTotal === null ? '' : 'al año'
    if (al) linea(al, A4[0] - M - pad - f.normal.widthOfTextAtSize(al, 8), arriba - pad - 26, f.normal, 8, TENUE)
    linea('Garantías principales que declara', x2, arriba - pad - 27, f.normal, 8, TENUE)
    lineas.forEach((l, i) => linea(l, M + pad, arriba - pad - 48 - i * 11.5, f.normal, 8.5))
    y = arriba - alto - 14
  }

  // ── Cuadro comparativo ──
  await pintarCuadroComparativo(lienzo, cmp, { recomendadaId })

  // ── Resumen por oferta ──
  // Solo lo que DIFIERE entre ofertas; lo que comparten todas sale una vez arriba («Común a todas las opciones»).
  if (ofertas.length > 0) {
    titulo('Resumen por oferta', 14, 110)
    const hechosDe = ofertas.map((o) => { const r = resumenDe(o.id); return r ? lineasResumen(r, actual !== null) : [] })
    const claveDe = ofertas.map((o) => garantiasClave(cmp.filas, o.id, 50))
    const hechos = separarComunes(hechosDe)
    const claves = separarComunes(claveDe)
    if (hechos.comunes.length > 0 || claves.comunes.length > 0) {
      const pad = 12
      const txt = [...hechos.comunes, ...(claves.comunes.length ? [`Garantías: ${claves.comunes.join(' · ')}`] : [])]
      const lineas = txt.flatMap((t) => partir(f.normal, paraFuente(f.normal, t), 8.5, ancho - pad * 2))
      const alto = pad * 2 + 14 + lineas.length * 11
      cabe(alto + 10)
      const arriba = y
      pagina.drawRectangle({ x: M, y: arriba - alto, width: ancho, height: alto, color: SUAVE })
      linea('Común a todas las opciones', M + pad, arriba - pad - 9, f.titulo, 9.5, PRIMARIO)
      lineas.forEach((l, k) => linea(l, M + pad, arriba - pad - 25 - k * 11, f.normal, 8.5, TEXTO))
      y = arriba - alto - 10
    }
    for (const [idx, o] of ofertas.entries()) {
      const r = resumenDe(o.id)
      const esRec = o.id === recomendadaId
      const pad = 12
      const colPrecio = 130
      const xTexto = M + pad + 84
      const wTexto = ancho - pad * 2 - 84 - colPrecio
      const nombre = partir(f.titulo, paraFuente(f.titulo, marcaDe(o)), 11.5, wTexto)
      const delta = r ? textoDelta(r) : null
      const lHechos = hechos.propias[idx].flatMap((h) => partir(f.normal, paraFuente(f.normal, h), 8.5, wTexto))
      const clave = claves.propias[idx].slice(0, 6)
      const lClave = clave.length ? partir(f.normal, paraFuente(f.normal, clave.join(' · ')), 8, ancho - pad * 2) : []
      const lAlerta = r?.infraseguroContinente ? partir(f.negrita, paraFuente(f.negrita, textoInfraseguro(r.infraseguroContinente)), 8, ancho - pad * 2 - 12) : []
      const prima = o.primaTotal === null ? textoPrimaOferta(o) : eur(o.primaTotal) + (o.firmeza === 'estimado' ? ' *' : '')
      const tamPrima = o.primaTotal === null ? 10 : 17
      const lPrima = partir(f.titulo, paraFuente(f.titulo, prima), tamPrima, colPrecio - 6)
      const ld = delta ? partir(f.normal, paraFuente(f.normal, delta), 7.5, colPrecio - 6) : []
      const altoPrecio = pad + lPrima.length * (tamPrima + 2) + 12 + ld.length * 9 + pad
      const alto = Math.max(altoPrecio, pad * 2 + 13 * nombre.length + (esRec ? 14 : 0) + 11 * lHechos.length + (lClave.length ? 8 + 10.5 * lClave.length : 0) + (lAlerta.length ? 8 + 10 * lAlerta.length + 8 : 0) + 4, pad * 2 + 30)
      cabe(alto + 10)
      const arriba = y
      pagina.drawRectangle({ x: M, y: arriba - alto, width: ancho, height: alto, color: rgb(1, 1, 1), borderColor: esRec ? PRIMARIO : BORDE, borderWidth: esRec ? 1.4 : 0.8 })
      await logoOInicial(o.compania, M + pad, arriba - pad, 70)
      let yy = arriba - pad - 10
      nombre.forEach((l) => { linea(l, xTexto, yy - 1.5, f.titulo, 11.5); yy -= 13 })
      if (esRec) { chip('Recomendada por tu corredor', xTexto, yy - 9, SUAVE, PRIMARIO); yy -= 14 }
      lHechos.forEach((l) => { linea(l, xTexto, yy - 9, f.normal, 8.5, TENUE); yy -= 11 })
      // Precio y delta.
      let yp = arriba - pad - tamPrima
      lPrima.forEach((l) => { linea(l, A4[0] - M - pad - f.titulo.widthOfTextAtSize(paraFuente(f.titulo, l), tamPrima), yp, f.titulo, tamPrima, PRIMARIO); yp -= tamPrima + 2 })
      if (o.primaTotal !== null) linea('al año', A4[0] - M - pad - f.normal.widthOfTextAtSize('al año', 8), yp - 8, f.normal, 8, TENUE)
      ld.forEach((l, k) => linea(l, A4[0] - M - pad - f.normal.widthOfTextAtSize(paraFuente(f.normal, l), 7.5), yp - 20 - k * 9, f.normal, 7.5, TENUE))
      if (lClave.length) {
        yy -= 8
        lClave.forEach((l) => { linea(l, M + pad, yy - 8, f.normal, 8); yy -= 10.5 })
      }
      if (lAlerta.length) {
        yy -= 8
        const hA = 10 * lAlerta.length + 8
        pagina.drawRectangle({ x: M + pad, y: yy - hA, width: ancho - pad * 2, height: hA, color: AMBAR_SUAVE })
        lAlerta.forEach((l, k) => linea(l, M + pad + 6, yy - 11 - k * 10, f.negrita, 8, AMBAR))
      }
      y = arriba - alto - 10
    }
  }

  // ── Análisis y recomendación ── (con su etiqueta SIEMPRE visible: IA revisada por el corredor, o la plantilla)
  pintarAnalisis(lienzo, narrativa)
  // Llamada a la acción: cómo aceptar (con la referencia; nunca un enlace con token).
  pintarLlamadaAccion(lienzo, { referencia: d.referencia, telefono: d.mediador.telefono ?? null, email: d.mediador.email })
  if (d.necesidades?.trim()) {
    cabe(50)
    linea('Lo que nos has pedido', M, y - 10, f.titulo, 10.5, PRIMARIO)
    y -= 18
    parrafo(d.necesidades.trim(), f.normal, 9.5)
    y -= 8
  }

  // ── Aviso legal y mediador ──
  y -= 4
  cabe(120)
  linea('Aviso legal', M, y - 10, f.titulo, 10)
  y -= 16
  parrafo(avisoLegalOfertas(cmp.ofertas), f.normal, 8, TENUE)
  y -= 8
  cabe(54)
  linea('Tu mediador', M, y - 10, f.titulo, 10)
  y -= 16
  parrafo(
    `${d.mediador.marca} · ${d.mediador.nombre}, corredor de seguros · Clave DGSFP ${d.mediador.claveDgsfp} · ${d.mediador.domicilio}` +
      (d.mediador.email ? ` · ${d.mediador.email}` : ''),
    f.normal, 8, TENUE,
  )

  // ── Pie en todas las páginas ──
  const pie = `${d.mediador.marca} · ${d.mediador.nombre}, corredor de seguros · Clave DGSFP ${d.mediador.claveDgsfp}`
  const paginas = pdf.getPages()
  paginas.forEach((pg, n) => {
    pg.drawRectangle({ x: M, y: M + 22, width: ancho, height: 0.6, color: BORDE })
    partir(f.normal, paraFuente(f.normal, pie), 7, ancho - 40).forEach((l, k) =>
      pg.drawText(l, { x: M, y: M + 12 - k * 9, size: 7, font: f.normal, color: TENUE }))
    const num = `${n + 1}/${paginas.length}`
    pg.drawText(num, { x: A4[0] - M - f.normal.widthOfTextAtSize(num, 7), y: M + 12, size: 7, font: f.normal, color: TENUE })
  })

  pdf.setTitle(`Estudio comparativo de seguro de ${ramoTxt(d.ramo)} — ${d.cliente}`)
  pdf.setCreator(d.mediador.marca)
  return pdf.save()
}
