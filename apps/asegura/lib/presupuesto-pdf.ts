// El presupuesto en PDF, para que Alberto lo descargue y se lo mande al cliente a mano.
//
// PURO (sin BD): recibe los datos ya leídos. Las opciones son las MISMAS que ve el cliente en el
// portal (congeladas, sin las ocultas) y en el mismo orden, con la misma prima (`prima_eur`).
//
// 🚨 Va al PROPIO tomador para que compruebe los datos de la emisión (Alberto, 28/09/2026): por eso lleva
// su DNI entero y, en hogar, la dirección del riesgo. Lo que NO lleva: IBAN, las observaciones internas de
// la compañía (`avisos`: «esta póliza quedará bloqueada…» es para el corredor) ni ningún enlace con token.
//
// 🔖 Lleva la REFERENCIA PROPIA (`AS-26-0042`, 30/09/2026) en la cabecera y le pide al cliente que la cite:
// con ella cualquiera de la correduría rescata este documento en el buscador y emite. 🚨 NUNCA el nº de
// proyecto de Avant2/Codeoscopic ni la referencia de la oferta del vendor: `DatosPdfPresupuesto` no los
// trae a propósito (lo vigila test/regression-presupuesto-referencia.test.ts).

import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { eur } from './dinero.ts'
import type { GrupoDatos } from './datos-cotizados.ts'
import { LOGOS, LOGOTIPO, NUNITO_400, NUNITO_700, QUICKSAND_700 } from './presupuesto-pdf-recursos.ts'

export type OpcionPdf = {
  compania: string
  producto: string
  modalidad: string | null
  categoria: string | null
  /** `null` = no se pudo leer. Se pinta «—», nunca 0. */
  primaEur: number | null
  /** `null` = el producto NO declara franquicia. JAMÁS «sin franquicia». */
  franquiciaEur: number | null
  firmeza: string
  papeles: string[]
  coberturas: string[]
}

export type DatosPdfPresupuesto = {
  /** Referencia propia `AS-AA-NNNN`. `null` = la BD aún no la tiene: el PDF sale sin ella, no con otra. */
  referencia: string | null
  cliente: string
  ramo: string
  creadoAt: Date
  venceEl: Date
  /**
   * «Revisa tus datos»: los MISMOS grupos que ve el cliente en el portal (`leerDatosCotizados`, DNI ya
   * enmascarado). `null` = no se han podido leer, y el PDF lo dice en vez de callarlo.
   */
  datosCalculo: GrupoDatos[] | null
  necesidades: string | null
  opciones: OpcionPdf[]
  mediador: { marca: string; nombre: string; claveDgsfp: string; domicilio: string; email: string | null }
}

const RAMOS: Record<string, string> = {
  auto: 'coche', moto: 'moto', hogar: 'hogar', vida: 'vida', decesos: 'decesos', salud: 'salud',
}

const PAPELES: Record<string, string> = {
  mas_barata: 'Más barata', mejor_cubierta: 'Mejor cubierta', equivalente: 'Equivalente a la actual',
}

/** Nombres de las coberturas INCLUIDAS del JSON congelado (`{ lista: [{ nombre, incluida }] }`). */
export function coberturasIncluidas(json: unknown): string[] {
  const lista = json && typeof json === 'object' && Array.isArray((json as { lista?: unknown }).lista)
    ? (json as { lista: unknown[] }).lista
    : Array.isArray(json) ? json : []
  const salida: string[] = []
  for (const c of lista) {
    if (!c || typeof c !== 'object') continue
    const { nombre, incluida } = c as { nombre?: unknown; incluida?: unknown }
    if (incluida === false || typeof nombre !== 'string' || !nombre.trim()) continue
    if (!salida.includes(nombre.trim())) salida.push(nombre.trim())
  }
  return salida
}

export function fechaCorta(d: Date): string {
  return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** El nombre del fichero: sin tildes ni espacios, para que no se rompa en ningún correo. */
export function nombreFicheroPresupuesto(d: Pick<DatosPdfPresupuesto, 'cliente' | 'ramo' | 'creadoAt'> & { referencia?: string | null }): string {
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const f = d.creadoAt.toISOString().slice(0, 10)
  const ref = d.referencia ? `${limpio(d.referencia)}-` : ''
  return `presupuesto-${ref}${limpio(RAMOS[d.ramo] ?? d.ramo)}-${limpio(d.cliente) || 'cliente'}-${f}.pdf`
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
function paraFuente(font: PDFFont, t: string): string {
  const validos = new Set(font.getCharacterSet())
  const cabe = (c: string) => c === '\n' || validos.has(c.codePointAt(0)!)
  // Una letra con un diacrítico que la fuente no trae (ș, ł, č…) cae a su letra base antes que a «?».
  return Array.from(t.replace(/\r/g, '').replace(/\t/g, ' '))
    .map((c) => (cabe(c) ? c : (() => { const b = c.normalize('NFD')[0] ?? ''; return b && cabe(b) ? b : '?' })()))
    .join('')
}

function partir(font: PDFFont, texto: string, tam: number, ancho: number): string[] {
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

/** Tarjetas = las recomendadas (con papel); sin ninguna, las 3 primeras. El resto va en tabla. Orden intacto. */
export function repartirOpciones<T extends { papeles: string[] }>(opciones: T[]): { tarjetas: T[]; resto: T[] } {
  const hay = opciones.some((o) => o.papeles.length > 0)
  const enTarjeta = (o: T, i: number) => (hay ? o.papeles.length > 0 : i < 3)
  return { tarjetas: opciones.filter(enTarjeta), resto: opciones.filter((o, i) => !enTarjeta(o, i)) }
}

/** Una sola línea: lo que no cabe se corta con «…». */
function recortar(font: PDFFont, t: string, tam: number, w: number): string {
  let s = paraFuente(font, t)
  if (font.widthOfTextAtSize(s, tam) <= w) return s
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, tam) > w) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

const A4: [number, number] = [595.28, 841.89]
const M = 44
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
// Paleta de `MARCA_ASEGURA` (@central/brand): primario #3364ee y acentoSuave #E3EFFF. Neutros sin tinte.
const PRIMARIO = hex('#3364ee')
const SUAVE = hex('#E3EFFF')
const TEXTO = hex('#161616')
const TENUE = hex('#6B6B6B')
const BORDE = hex('#E4E4E4')
const VERDE = hex('#15803D')
const VERDE_SUAVE = hex('#E7F6EC')
const MAX_COBERTURAS = 8

type Fuentes = { titulo: PDFFont; normal: PDFFont; negrita: PDFFont }

export async function pdfPresupuesto(d: DatosPdfPresupuesto): Promise<Uint8Array> {
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
  const PIE = 46
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
  const chip = (t: string, x: number, yy: number, fondo: RGB, color: RGB): number => {
    const tam = 7.5
    const w = f.negrita.widthOfTextAtSize(paraFuente(f.negrita, t), tam) + 10
    pagina.drawRectangle({ x, y: yy - 3.5, width: w, height: tam + 6, color: fondo })
    linea(t, x + 5, yy, f.negrita, tam, color)
    return w
  }

  // ── Cabecera ──
  const altoLogo = 26
  pagina.drawImage(logotipo, { x: M, y: y - altoLogo, width: (logotipo.width / logotipo.height) * altoLogo, height: altoLogo })
  const ref = textosReferencia(d.referencia)
  const fechaTxt = `Presupuesto · ${fechaCorta(d.creadoAt)}`
  if (ref) {
    linea(ref.cabecera, A4[0] - M - f.negrita.widthOfTextAtSize(paraFuente(f.negrita, ref.cabecera), 11), y - 9, f.negrita, 11, PRIMARIO)
    linea(fechaTxt, A4[0] - M - f.normal.widthOfTextAtSize(fechaTxt, 9), y - 23, f.normal, 9, TENUE)
  } else {
    linea(fechaTxt, A4[0] - M - f.normal.widthOfTextAtSize(fechaTxt, 9), y - 17, f.normal, 9, TENUE)
  }
  y -= altoLogo + 12
  pagina.drawRectangle({ x: M, y, width: ancho, height: 2, color: PRIMARIO })
  y -= 26

  linea(`Tu presupuesto de seguro de ${RAMOS[d.ramo] ?? d.ramo}`, M, y - 20, f.titulo, 20)
  y -= 32
  parrafo(`Para ${d.cliente}`, f.negrita, 11, TEXTO, M, ancho, 1.5)
  y -= 1
  linea(`Precios válidos hasta el ${fechaCorta(d.venceEl)}`, M, y - 9.5, f.normal, 9.5, TENUE)
  y -= 22
  if (ref) {
    parrafo(ref.cita, f.negrita, 9.5, PRIMARIO)
    y -= 10
  }

  // ── Revisa tus datos (lo mismo que el cliente ve primero en el portal) ──
  if (d.datosCalculo === null || d.datosCalculo.length === 0) {
    cabe(40)
    parrafo('No hemos podido leer los datos con los que se calculó este precio. Llámanos y los revisamos contigo antes de contratar.', f.negrita, 9.5, PRIMARIO)
    y -= 14
  } else {
    const pad = 14
    const colW = (ancho - pad * 2 - 20) / 2
    // Cada grupo en la columna que vaya más corta.
    const lineasValor = (fl: { etiqueta: string; valor: string }) => {
      const wEt = f.normal.widthOfTextAtSize(paraFuente(f.normal, `${fl.etiqueta}: `), 9)
      return { wEt, valor: partir(f.negrita, paraFuente(f.negrita, fl.valor), 9, colW - wEt) }
    }
    // El MISMO cálculo que el pintado: si no, un valor largo se sale de la caja.
    const altoGrupo = (g: GrupoDatos) => 16 + g.filas.reduce((a, fl) => a + 11.5 * Math.max(1, lineasValor(fl).valor.length), 0) + 8
    const cols: GrupoDatos[][] = [[], []]
    const alturas = [0, 0]
    for (const g of d.datosCalculo) {
      const k = alturas[0] <= alturas[1] ? 0 : 1
      cols[k].push(g)
      alturas[k] += altoGrupo(g)
    }
    // Cabecera (título + frase) = 44; el aviso del pie necesita su propia franja.
    const alto = pad + 44 + Math.max(...alturas) + 20
    cabe(alto)
    const arriba = y
    pagina.drawRectangle({ x: M, y: arriba - alto, width: ancho, height: alto, color: SUAVE })
    linea('Revisa tus datos', M + pad, arriba - pad - 11, f.titulo, 12, PRIMARIO)
    linea('Son los datos con los que las compañías han calculado tu precio: el precio y la póliza dependen de ellos.', M + pad, arriba - pad - 26, f.normal, 8.5, TENUE)
    cols.forEach((col, k) => {
      const x = M + pad + k * (colW + 20)
      let yy = arriba - pad - 44
      for (const g of col) {
        linea(g.titulo, x, yy - 9.5, f.titulo, 9.5)
        yy -= 16
        for (const fl of g.filas) {
          const { wEt, valor } = lineasValor(fl)
          linea(`${fl.etiqueta}: `, x, yy - 9, f.normal, 9, TENUE)
          valor.forEach((v, n) => linea(v, x + wEt, yy - 9 - n * 11.5, f.negrita, 9))
          yy -= 11.5 * Math.max(1, valor.length)
        }
        yy -= 8
      }
    })
    linea('Si alguno no es correcto, dínoslo antes de contratar: cambia el precio.', M + pad, arriba - alto + 10, f.negrita, 8.5, PRIMARIO)
    y = arriba - alto - 20
  }

  // ── Opciones ──
  // Como el portal: en tarjeta las recomendadas (las que tienen papel: más barata, mejor cubierta,
  // equivalente); el resto, en una tabla compacta. Sin ninguna recomendada, las 3 primeras.
  const { tarjetas, resto: otras } = repartirOpciones(d.opciones)
  cabe(30)
  linea(tarjetas.length === d.opciones.length ? (d.opciones.length === 1 ? 'Tu opción' : `Tus ${d.opciones.length} opciones`) : 'Nuestras recomendaciones', M, y - 14, f.titulo, 14)
  y -= 26

  for (const o of tarjetas) {
    const pad = 12
    const colLogo = 92
    const colPrecio = 110
    const xTexto = M + pad + colLogo + 10
    const wTexto = ancho - pad * 2 - colLogo - 10 - colPrecio
    const titulo = partir(f.titulo, paraFuente(f.titulo, o.modalidad ?? o.producto), 11.5, wTexto)
    const det: string[] = []
    if (o.categoria) det.push(o.categoria)
    det.push(o.franquiciaEur === null ? 'Franquicia: la compañía no la indica' : `Franquicia ${eur(o.franquiciaEur)}`)
    const detalle = partir(f.normal, paraFuente(f.normal, det.join(' · ')), 8.5, wTexto)
    const cob = o.coberturas.slice(0, MAX_COBERTURAS)
    const resto = o.coberturas.length - cob.length
    const cobLineas = cob.length
      ? partir(f.normal, paraFuente(f.normal, cob.join(' · ') + (resto > 0 ? ` · y ${resto} más` : '')), 8, wTexto)
      : []
    const papeles = o.papeles.map((p) => PAPELES[p]).filter(Boolean)
    // Mínimo: lo que ocupan el logo con su nombre y el bloque del precio.
    const alto = Math.max(pad * 2 + 50, pad + 10 + 13 * titulo.length + (papeles.length ? 14 : 0) + 11 * detalle.length + (cobLineas.length ? 6 + 10.5 * cobLineas.length : 0) + pad + 2)
    cabe(alto + 10)

    const arriba = y
    pagina.drawRectangle({ x: M, y: arriba - alto, width: ancho, height: alto, color: rgb(1, 1, 1), borderColor: o.papeles.length ? PRIMARIO : BORDE, borderWidth: o.papeles.length ? 1.2 : 0.8 })

    // Logo (o la inicial, nunca un hueco).
    const img = await logoDe(o.compania)
    const yLogo = arriba - pad - 4
    if (img) {
      const h = Math.min(26, (colLogo * img.height) / img.width)
      const w = (img.width / img.height) * h
      pagina.drawImage(img, { x: M + pad, y: yLogo - h, width: w, height: h })
    } else {
      pagina.drawCircle({ x: M + pad + 13, y: yLogo - 13, size: 13, color: SUAVE })
      const ini = o.compania.trim().charAt(0).toUpperCase() || '?'
      linea(ini, M + pad + 13 - f.titulo.widthOfTextAtSize(paraFuente(f.titulo, ini), 12) / 2, yLogo - 17, f.titulo, 12, PRIMARIO)
    }
    linea(recortar(f.normal, o.compania, 8, colLogo), M + pad, yLogo - 40, f.normal, 8, TENUE)

    // Precio.
    const precio = o.primaEur === null ? '—' : eur(o.primaEur)
    const wp = f.titulo.widthOfTextAtSize(paraFuente(f.titulo, precio), 17)
    linea(precio, A4[0] - M - pad - wp, arriba - pad - 17, f.titulo, 17, PRIMARIO)
    const al = 'al año'
    linea(al, A4[0] - M - pad - f.normal.widthOfTextAtSize(al, 8), arriba - pad - 29, f.normal, 8, TENUE)
    if (o.firmeza !== 'firme') {
      const est = 'Precio estimado'
      linea(est, A4[0] - M - pad - f.normal.widthOfTextAtSize(est, 7.5), arriba - pad - 40, f.normal, 7.5, TENUE)
    }

    // Texto.
    let yy = arriba - pad - 10
    for (const l of titulo) { linea(l, xTexto, yy - 1.5, f.titulo, 11.5); yy -= 13 }
    if (papeles.length) {
      let x = xTexto
      for (const p of papeles) x += chip(p, x, yy - 9, p === 'Más barata' ? VERDE_SUAVE : SUAVE, p === 'Más barata' ? VERDE : PRIMARIO) + 5
      yy -= 14
    }
    for (const l of detalle) { linea(l, xTexto, yy - 9, f.normal, 8.5, TENUE); yy -= 11 }
    if (cobLineas.length) {
      yy -= 6
      for (const l of cobLineas) { linea(l, xTexto, yy - 8, f.normal, 8); yy -= 10.5 }
    }
    y = arriba - alto - 10
  }

  if (otras.length) {
    y -= 8
    cabe(60)
    linea(`Otras ${otras.length} opciones`, M, y - 13, f.titulo, 13)
    y -= 24
    const cCompania = M + 8, cModalidad = M + 128, cTipo = M + 350, cPrecio = A4[0] - M - 8
    const cabecera = () => {
      pagina.drawRectangle({ x: M, y: y - 18, width: ancho, height: 18, color: SUAVE })
      linea('Compañía', cCompania, y - 12.5, f.negrita, 8, PRIMARIO)
      linea('Modalidad', cModalidad, y - 12.5, f.negrita, 8, PRIMARIO)
      linea('Tipo', cTipo, y - 12.5, f.negrita, 8, PRIMARIO)
      const t = 'Precio al año'
      linea(t, cPrecio - f.negrita.widthOfTextAtSize(t, 8), y - 12.5, f.negrita, 8, PRIMARIO)
      y -= 18
    }
    cabecera()
    for (const o of otras) {
      const mod = partir(f.normal, paraFuente(f.normal, o.modalidad ?? o.producto), 8.5, cTipo - cModalidad - 10)
      const alto = 8 + 11 * mod.length
      if (y - alto < M + PIE) { nuevaPagina(); cabecera() }
      linea(partir(f.negrita, paraFuente(f.negrita, o.compania), 8.5, cModalidad - cCompania - 10)[0] ?? '', cCompania, y - 12, f.negrita, 8.5)
      mod.forEach((l, n) => linea(l, cModalidad, y - 12 - n * 11, f.normal, 8.5))
      if (o.categoria) linea(partir(f.normal, paraFuente(f.normal, o.categoria), 8.5, 90)[0] ?? '', cTipo, y - 12, f.normal, 8.5, TENUE)
      const precio = (o.primaEur === null ? '—' : eur(o.primaEur)) + (o.firmeza !== 'firme' ? ' *' : '')
      linea(precio, cPrecio - f.negrita.widthOfTextAtSize(paraFuente(f.negrita, precio), 8.5), y - 12, f.negrita, 8.5)
      y -= alto
      pagina.drawRectangle({ x: M, y, width: ancho, height: 0.5, color: BORDE })
    }
    if (otras.some((o) => o.firmeza !== 'firme')) {
      y -= 4
      parrafo('* Precio estimado por la compañía.', f.normal, 7.5, TENUE)
    }
  }

  // ── Necesidades ──
  if (d.necesidades?.trim()) {
    y -= 6
    cabe(40)
    linea('Lo que nos has pedido', M, y - 11, f.titulo, 11)
    y -= 18
    parrafo(d.necesidades.trim(), f.normal, 9.5)
    y -= 6
  }

  // ── Importante ──
  y -= 8
  cabe(60)
  linea('Importante', M, y - 10, f.titulo, 10)
  y -= 16
  const hayEstimados = d.opciones.some((o) => o.firmeza !== 'firme')
  parrafo(
    (hayEstimados ? 'Los precios estimados los calcula la compañía con los datos de arriba y pueden variar al contratar. ' : '') +
      'Este documento es informativo y no es una póliza: el seguro empieza cuando la compañía la emite. ' +
      'Antes de contratar te entregaremos la ficha de información del producto (IPID) de la opción que elijas.',
    f.normal, 8.5, TENUE,
  )

  // ── Pie en todas las páginas ──
  const pie = `${d.mediador.marca} · ${d.mediador.nombre}, corredor de seguros · Clave DGSFP ${d.mediador.claveDgsfp} · ${d.mediador.domicilio}` +
    (d.mediador.email ? ` · ${d.mediador.email}` : '')
  const paginas = pdf.getPages()
  paginas.forEach((pg, n) => {
    pg.drawRectangle({ x: M, y: M + 22, width: ancho, height: 0.6, color: BORDE })
    const lineasPie = partir(f.normal, paraFuente(f.normal, pie), 7, ancho - 40)
    lineasPie.forEach((l, k) => pg.drawText(l, { x: M, y: M + 12 - k * 9, size: 7, font: f.normal, color: TENUE }))
    const num = `${n + 1}/${paginas.length}`
    pg.drawText(num, { x: A4[0] - M - f.normal.widthOfTextAtSize(num, 7), y: M + 12, size: 7, font: f.normal, color: TENUE })
  })

  pdf.setTitle(`Presupuesto de seguro de ${RAMOS[d.ramo] ?? d.ramo} — ${d.cliente}`)
  pdf.setCreator(d.mediador.marca)
  return pdf.save()
}
