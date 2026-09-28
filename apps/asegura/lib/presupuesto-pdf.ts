// El presupuesto en PDF, para que Alberto lo descargue y se lo mande al cliente a mano.
//
// PURO (sin BD): recibe los datos ya leídos. Las opciones son las MISMAS que ve el cliente en el
// portal (congeladas, sin las ocultas) y en el mismo orden, con la misma prima (`prima_eur`).
//
// 🚨 Lo que NO lleva, a propósito: DNI, IBAN, dirección ni las observaciones internas de la
// compañía (`avisos`: «esta póliza quedará bloqueada…» es para el corredor, no para el cliente).
// Y ningún enlace con token: el token solo existe en claro en el mensaje que sale, y un PDF se reenvía.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { eur } from './dinero.ts'

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

/** Helvetica solo sabe WinAnsi: lo que no está se cambia por «?» en vez de romper el PDF. */
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

const A4: [number, number] = [595.28, 841.89]
const M = 48
const AZUL = rgb(0.2, 0.39, 0.93)
const GRIS = rgb(0.35, 0.35, 0.4)
const LINEA = rgb(0.85, 0.86, 0.9)

export async function pdfPresupuesto(d: DatosPdfPresupuesto): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ancho = A4[0] - 2 * M
  let pagina: PDFPage = pdf.addPage(A4)
  let y = A4[1] - M

  const salto = (alto: number) => {
    if (y - alto < M + 30) { pagina = pdf.addPage(A4); y = A4[1] - M }
  }
  const texto = (t: string, o: { font?: PDFFont; tam?: number; color?: ReturnType<typeof rgb>; x?: number; w?: number } = {}) => {
    const font = o.font ?? normal
    const tam = o.tam ?? 10
    for (const l of partir(font, paraFuente(font, t), tam, o.w ?? ancho)) {
      salto(tam * 1.5)
      pagina.drawText(l, { x: o.x ?? M, y: y - tam, size: tam, font, color: o.color ?? rgb(0.1, 0.1, 0.12) })
      y -= tam * 1.45
    }
  }
  const raya = () => {
    pagina.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: LINEA })
    y -= 10
  }

  // Cabecera
  texto(d.mediador.marca, { font: negrita, tam: 20, color: AZUL })
  texto(`Presupuesto de seguro de ${RAMOS[d.ramo] ?? d.ramo}`, { font: negrita, tam: 14 })
  y -= 4
  texto(`Para: ${d.cliente}`, { tam: 11 })
  texto(`Fecha: ${fechaCorta(d.creadoAt)}   ·   Precios válidos hasta: ${fechaCorta(d.venceEl)}`, { tam: 10, color: GRIS })
  y -= 6
  raya()

  if (d.vehiculo) {
    const v: string[] = []
    if (d.vehiculo.matricula) v.push(`Matrícula ${d.vehiculo.matricula}`)
    if (d.vehiculo.kmAnuales !== null) v.push(`${miles(d.vehiculo.kmAnuales)} km al año`)
    if (d.vehiculo.garaje) v.push(d.vehiculo.garaje)
    if (v.length) {
      texto('Datos con los que se ha calculado', { font: negrita, tam: 11 })
      texto(v.join('   ·   '), { tam: 10 })
      texto('Si alguno no es correcto, dínoslo antes de contratar: cambia el precio.', { tam: 9, color: GRIS })
      y -= 6
      raya()
    }
  }

  texto(`Opciones (${d.opciones.length})`, { font: negrita, tam: 12 })
  y -= 2
  d.opciones.forEach((o, i) => {
    salto(70)
    const titulo = `${i + 1}. ${o.compania} — ${o.modalidad ?? o.producto}`
    const precio = o.primaEur === null ? '—' : `${eur(o.primaEur)} / año`
    const anchoPrecio = negrita.widthOfTextAtSize(paraFuente(negrita, precio), 12)
    const yTitulo = y
    texto(titulo, { font: negrita, tam: 11, w: ancho - anchoPrecio - 16 })
    pagina.drawText(paraFuente(negrita, precio), { x: A4[0] - M - anchoPrecio, y: yTitulo - 12, size: 12, font: negrita, color: AZUL })
    const det: string[] = []
    if (o.categoria) det.push(o.categoria)
    det.push(o.franquiciaEur === null ? 'Franquicia: no la declara la compañía' : `Franquicia: ${eur(o.franquiciaEur)}`)
    const papeles = o.papeles.map((p) => PAPELES[p]).filter(Boolean)
    if (papeles.length) det.push(papeles.join(' · '))
    if (o.firmeza !== 'firme') det.push('Precio estimado')
    texto(det.join('   ·   '), { tam: 9, color: GRIS })
    if (o.coberturas.length) texto(`Incluye: ${o.coberturas.join(', ')}.`, { tam: 9 })
    y -= 6
  })
  raya()

  if (d.necesidades?.trim()) {
    texto('Lo que nos has pedido', { font: negrita, tam: 11 })
    texto(d.necesidades.trim(), { tam: 10 })
    y -= 6
    raya()
  }

  const hayEstimados = d.opciones.some((o) => o.firmeza !== 'firme')
  texto('Importante', { font: negrita, tam: 10 })
  texto(
    (hayEstimados
      ? 'Los precios marcados como estimados los calcula la compañía con los datos de arriba y pueden variar al contratar. '
      : '') +
      'Este documento es informativo y no es una póliza: el seguro empieza cuando la compañía la emite. ' +
      'Antes de contratar te entregaremos la ficha de información del producto (IPID) de la opción que elijas.',
    { tam: 9, color: GRIS },
  )
  y -= 8
  texto(
    `${d.mediador.marca} · ${d.mediador.nombre}, corredor de seguros, clave DGSFP ${d.mediador.claveDgsfp} · ${d.mediador.domicilio}` +
      (d.mediador.email ? ` · ${d.mediador.email}` : ''),
    { tam: 8, color: GRIS },
  )

  pdf.setTitle(`Presupuesto de seguro de ${RAMOS[d.ramo] ?? d.ramo} — ${d.cliente}`)
  pdf.setCreator(d.mediador.marca)
  return pdf.save()
}
