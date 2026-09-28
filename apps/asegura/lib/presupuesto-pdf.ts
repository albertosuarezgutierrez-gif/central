// El presupuesto en PDF, para que Alberto lo descargue y se lo mande al cliente a mano.
//
// PURO (sin BD): recibe los datos ya leídos. Las opciones son las MISMAS que ve el cliente en el
// portal (congeladas, sin las ocultas) y en el mismo orden, con la misma prima (`prima_eur`).
//
// 🚨 Lo que NO lleva, a propósito: DNI, IBAN, dirección ni las observaciones internas de la
// compañía (`avisos`: «esta póliza quedará bloqueada…» es para el corredor, no para el cliente).
// Y ningún enlace con token: el token solo existe en claro en el mensaje que sale, y un PDF se reenvía.

import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { eur } from './dinero.ts'
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
  cliente: string
  ramo: string
  creadoAt: Date
  venceEl: Date
  vehiculo: { matricula: string | null; kmAnuales: number | null; garaje: string | null } | null
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

/** El id del catálogo de garajes, en castellano. Lo que no se reconoce no se pinta (`null`). */
export function rotuloGaraje(id: string | null): string | null {
  if (!id) return null
  // Moto trae ids de texto («NoGarage»); auto, números del catálogo que aquí no se traducen.
  const t = id.toLowerCase()
  if (t === 'nogarage') return 'Sin garaje'
  if (/private|individual/.test(t)) return 'Garaje privado'
  if (/collective|shared|community/.test(t)) return 'Garaje colectivo'
  return null
}

export function fechaCorta(d: Date): string {
  return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function miles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** El nombre del fichero: sin tildes ni espacios, para que no se rompa en ningún correo. */
export function nombreFicheroPresupuesto(d: Pick<DatosPdfPresupuesto, 'cliente' | 'ramo' | 'creadoAt'>): string {
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const f = d.creadoAt.toISOString().slice(0, 10)
  return `presupuesto-${limpio(RAMOS[d.ramo] ?? d.ramo)}-${limpio(d.cliente) || 'cliente'}-${f}.pdf`
}

/** Lo que la fuente no tiene (un emoji) se cambia por «?» en vez de romper el PDF. */
function paraFuente(font: PDFFont, t: string): string {
  const validos = new Set(font.getCharacterSet())
  return Array.from(t.replace(/\r/g, '').replace(/\t/g, ' ')).map((c) => (c === '\n' || validos.has(c.codePointAt(0)!) ? c : '?')).join('')
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
  const fechaTxt = `Presupuesto · ${fechaCorta(d.creadoAt)}`
  linea(fechaTxt, A4[0] - M - f.normal.widthOfTextAtSize(fechaTxt, 9), y - 17, f.normal, 9, TENUE)
  y -= altoLogo + 12
  pagina.drawRectangle({ x: M, y, width: ancho, height: 2, color: PRIMARIO })
  y -= 26

  linea(`Tu presupuesto de seguro de ${RAMOS[d.ramo] ?? d.ramo}`, M, y - 20, f.titulo, 20)
  y -= 32
  linea(`Para ${d.cliente}`, M, y - 11, f.negrita, 11)
  y -= 17
  linea(`Precios válidos hasta el ${fechaCorta(d.venceEl)}`, M, y - 9.5, f.normal, 9.5, TENUE)
  y -= 22

  // ── Datos del cálculo ──
  const datos: string[] = []
  if (d.vehiculo?.matricula) datos.push(`Matrícula ${d.vehiculo.matricula}`)
  if (d.vehiculo && d.vehiculo.kmAnuales !== null) datos.push(`${miles(d.vehiculo.kmAnuales)} km al año`)
  if (d.vehiculo?.garaje) datos.push(d.vehiculo.garaje)
  if (datos.length) {
    const alto = 54
    cabe(alto)
    pagina.drawRectangle({ x: M, y: y - alto, width: ancho, height: alto, color: SUAVE })
    linea('Datos con los que lo hemos calculado', M + 14, y - 18, f.titulo, 10.5, PRIMARIO)
    linea(datos.join('   ·   '), M + 14, y - 33, f.negrita, 10)
    linea('Si alguno no es correcto, dínoslo antes de contratar: cambia el precio.', M + 14, y - 46, f.normal, 8.5, TENUE)
    y -= alto + 20
  }

  // ── Opciones ──
  cabe(30)
  linea(d.opciones.length === 1 ? 'Tu opción' : `Tus ${d.opciones.length} opciones`, M, y - 14, f.titulo, 14)
  y -= 26

  for (const o of d.opciones) {
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
    linea(o.compania, M + pad, yLogo - 40, f.normal, 8, TENUE)

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
