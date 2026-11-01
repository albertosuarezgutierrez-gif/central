// Mapfre auto 0.8.39 (01/11/2026) · GARANTÍAS de cada producto, leídas del PDF del proyecto o, si no hay, de la pantalla «Coberturas».
// Alberto (AS-26-0042): el bot solo guardaba el precio y las 14 garantías de las 2 opciones salían «No figura»; «hay que descargar el
// proyecto, que tiene toda la información». Mismo formato que Allianz (`OfertaNormalizada.coberturas` / `franquicias`).
//
// 🚨 Solo LECTURA y funciones PURAS (texto → coberturas). Nunca se inventa un estado, un límite ni una franquicia: lo que no consta
//    queda `null`. Una línea sin estado ni importe no es una garantía. Sin texto legible → [] (y el aviso «coberturas no leídas»).
// 🚨 Sin datos personales en avisos ni logs (solo recuentos).
import type { CoberturaOferta, FranquiciaOferta, OfertaNormalizada } from '@central/module-tarificacion'

export const AVISO_COBERTURAS_NO_LEIDAS = 'coberturas no leídas'
export const AVISO_COBERTURAS_PDF = 'Garantías leídas del PDF del proyecto de Mapfre.'
export const AVISO_COBERTURAS_PANTALLA = 'Garantías leídas de la pantalla «Coberturas» de Mapfre (el PDF del proyecto no se pudo leer).'
export const AVISO_COBERTURAS_SIN_LEER = 'Garantías de Mapfre NO leídas (ni del PDF del proyecto ni de la pantalla): coberturas no leídas.'

const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim()
const plano = (s: string) => limpiar(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Importe español «1.234,56» / «150» / «150,5» → número; ilegible → null. */
export function importeEsp(t: string | null | undefined): number | null {
  if (typeof t !== 'string') return null
  const s = t.trim()
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(s)) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const IMPORTE = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)\\s*(?:€|eur\\b|euros?)'
const RE_LIMITE = new RegExp(`(?:l[ií]mite|hasta|m[aá]ximo|suma\\s+asegurada)\\s*(?:de)?\\s*:?\\s*${IMPORTE}`, 'i')
const RE_CAPITAL = new RegExp(`(?:capital)\\s*(?:asegurado)?\\s*:?\\s*${IMPORTE}`, 'i')
const RE_FRANQ = new RegExp(`franquicia\\s*(?:de)?\\s*:?\\s*${IMPORTE}`, 'i')
const RE_SIN_FRANQ = /sin\s+franquicia/i
const RE_IMPORTE_SUELTO = new RegExp(IMPORTE, 'i')

const RE_EXCLUIDA = /^(?:no\s+incluid[oa]s?|no\s+contratad[oa]s?|no\s+cubre|excluid[oa]s?|no)$/i
const RE_INCLUIDA = /^(?:incluid[oa]s?|contratad[oa]s?|cubre|cubierto|s[ií])$/i
// Líneas que nunca son una garantía (precio, datos del riesgo, cabeceras del documento).
const RE_NO_GARANTIA = /prima|recibo|impuesto|consorcio|\btotal\b|tomador|\bnif\b|\bdni\b|matr[ií]cula|bastidor|fecha|n[ºo°]\s*de\s*(?:proyecto|p[oó]liza)|p[aá]gina|mapfre\s+espa|domicilio|tel[eé]fono|e-?mail|c[oó]digo\s+postal|mediador|forma\s+de\s+pago|periodicidad/i

type Valor = { estado: CoberturaOferta['estado']; capital: number | null; limite: number | null; franquicia: number | null; franquiciaTexto: string | null }

/** Interpreta el texto de valor de una línea («Incluida», «No», «Límite 300 €», «Franquicia 150 €»…). null = no dice nada útil. */
export function valorDeTexto(texto: string): Valor | null {
  const t = limpiar(texto)
  if (t === '') return null
  let estado: CoberturaOferta['estado'] = null
  const trozos = t.split(/\s*[|;]\s*/)
  for (const z of trozos) {
    const w = z.replace(/[.:]+$/g, '').trim()
    if (RE_EXCLUIDA.test(w)) { estado = 'excluida'; break }
    if (RE_INCLUIDA.test(w)) { estado = 'incluida'; break }
  }
  if (estado === null) {
    const ini = /^(no\s+incluid[oa]s?|no\s+contratad[oa]s?|excluid[oa]s?|incluid[oa]s?|contratad[oa]s?)\b/i.exec(t)
    if (ini) estado = /^(?:no|excluid)/i.test(ini[1]!) ? 'excluida' : 'incluida'
  }
  const lim = RE_LIMITE.exec(t), cap = RE_CAPITAL.exec(t), fr = RE_FRANQ.exec(t)
  const limite = lim ? importeEsp(lim[1]) : null
  const capital = cap ? importeEsp(cap[1]) : null
  let franquicia = fr ? importeEsp(fr[1]) : null
  if (franquicia === null && RE_SIN_FRANQ.test(t)) franquicia = 0
  // Un importe suelto sin palabra clave es el límite/suma de esa garantía (no se llama franquicia ni capital sin que lo diga).
  let suelto: number | null = null
  if (limite === null && capital === null && franquicia === null) {
    const s = RE_IMPORTE_SUELTO.exec(t)
    suelto = s ? importeEsp(s[1]) : null
  }
  if (estado === null && limite === null && capital === null && franquicia === null && suelto === null) return null
  // Un límite o una franquicia dentro de una garantía sin estado explícito implica que figura contratada.
  if (estado === null && (limite !== null || capital !== null || suelto !== null)) estado = 'incluida'
  return { estado, capital, limite: limite ?? suelto, franquicia, franquiciaTexto: fr || RE_SIN_FRANQ.test(t) ? t.slice(0, 120) : null }
}

/**
 * v0.2.59/Allianz: valor de un texto en el contexto de su FILA. Una fila de «franquicia» con un importe suelto (sin palabra clave) → franquicia, no límite.
 * Sin importe en el texto → no cambia nada (nunca se inventa). PURA.
 */
export function valorDeTextoEnFila(descripcion: string, texto: string): Valor | null {
  const v = valorDeTexto(texto)
  if (v && /franquicia/i.test(descripcion) && v.franquicia === null && v.limite !== null && v.capital === null) return { ...v, franquicia: v.limite, limite: null, franquiciaTexto: limpiar(texto).slice(0, 120) }
  return v
}

const SEP = /\t+|\s{2,}|\s*\|\s*|\s*:\s+|\s*\.{3,}\s*/
const RE_VALOR_FINAL = /^(.*\S)\s+(no\s+incluid[oa]s?|no\s+contratad[oa]s?|incluid[oa]s?|contratad[oa]s?|excluid[oa]s?|s[ií]|no)$/i

function etiquetaValida(e: string): boolean {
  const t = limpiar(e)
  return t.length >= 3 && t.length <= 90 && /\p{L}{3}/u.test(t) && !RE_NO_GARANTIA.test(t)
}

/** ¿La línea es SOLO un valor (el PDF/pantalla pone etiqueta y valor en líneas distintas)? */
function esSoloValor(l: string): boolean {
  const t = limpiar(l)
  if (t === '') return false
  const v = valorDeTexto(t)
  if (!v) return false
  // «Franquicia 150 €» / «Incluida» / «300 €» / «Límite 600 €»: sin letras de una etiqueta propia.
  const resto = t.replace(RE_LIMITE, '').replace(RE_CAPITAL, '').replace(RE_FRANQ, '').replace(RE_SIN_FRANQ, '').replace(new RegExp(IMPORTE, 'ig'), '')
    .replace(/\b(no\s+incluid[oa]s?|no\s+contratad[oa]s?|incluid[oa]s?|contratad[oa]s?|excluid[oa]s?|s[ií]|no|franquicia|l[ií]mite|capital)\b/gi, '').replace(/[\s.:;,|€-]+/g, '')
  return resto === ''
}

/** Líneas de texto → coberturas (formato Allianz). Sin repetidas (gana la primera); lo que no es una garantía se ignora. PURA. */
export function coberturasDeLineas(lineas: readonly string[]): { coberturas: CoberturaOferta[]; franquicias: FranquiciaOferta[] } {
  const coberturas: CoberturaOferta[] = []
  const franquicias: FranquiciaOferta[] = []
  const vistas = new Set<string>()
  const anotar = (etiqueta: string, v: Valor) => {
    const lit = limpiar(etiqueta).replace(/[.:\-–]+$/g, '').trim()
    if (!etiquetaValida(lit)) return
    const k = plano(lit)
    if (vistas.has(k)) return
    vistas.add(k)
    coberturas.push({ clave: lit, literal: lit, estado: v.estado, capital: v.capital, limite: v.limite, franquicia: v.franquicia })
    if (v.franquicia !== null || v.franquiciaTexto) franquicias.push({ ambito: lit, importeEur: v.franquicia, literal: v.franquicia === null ? v.franquiciaTexto : null })
  }
  let pendiente: string | null = null
  for (const bruta of lineas) {
    const l = limpiar(bruta.replace(/\t/g, '  '))
    if (l === '') { pendiente = null; continue }
    if (pendiente !== null && esSoloValor(l)) { const v = valorDeTexto(l); if (v) anotar(pendiente, v); pendiente = null; continue }
    pendiente = null
    const partes = bruta.trim().split(SEP).map(limpiar).filter(Boolean)
    if (partes.length >= 2) {
      const v = valorDeTexto(partes.slice(1).join(' | '))
      if (v) { anotar(partes[0]!, v); continue }
    }
    const fin = RE_VALOR_FINAL.exec(l)
    if (fin) { const v = valorDeTexto(fin[2]!); if (v) { anotar(fin[1]!, v); continue } }
    // «Robo - Límite 300 €» / «Lunas: franquicia 50 €» en una sola cadena.
    const kw = /^(.*?\S)\s*[-–:]?\s+((?:l[ií]mite|capital|franquicia|sin\s+franquicia|suma\s+asegurada)\b.*)$/i.exec(l)
    if (kw) { const v = valorDeTexto(kw[2]!); if (v && etiquetaValida(kw[1]!)) { anotar(kw[1]!, v); continue } }
    if (etiquetaValida(l) && !valorDeTexto(l)) pendiente = l
  }
  return { coberturas, franquicias }
}

export type CoberturasPorProducto = Map<string, { coberturas: CoberturaOferta[]; franquicias: FranquiciaOferta[] }>

/**
 * Parte un texto en secciones por el NOMBRE EXACTO del producto (línea que es solo el nombre, sin importar mayúsculas/tildes). Una
 * sección acaba en el siguiente nombre de producto. Sin ningún encabezado: con UN solo producto, todo el texto; con varios, nada
 * (no se reparte a ojo). PURA.
 */
export function coberturasPorProducto(lineas: readonly string[], productos: readonly string[]): CoberturasPorProducto {
  const salida: CoberturasPorProducto = new Map()
  const claves = productos.map((p) => plano(p)).filter(Boolean)
  const cab: { i: number; k: string }[] = []
  lineas.forEach((l, i) => { const k = plano(l.replace(/^\W+|\W+$/g, '')); if (claves.includes(k)) cab.push({ i, k }) })
  // v0.8.43: un producto SIN encabezado exacto (run 48b0df76: solo «TERCEROS AMPLIADO» se halló en el PDF) admite «NOMBRE – 392,02 €» / «NOMBRE (anual)»:
  // la línea EMPIEZA por el nombre y lo que sigue no es una letra ni un dígito (no «Terceros afectados…»), y no es el comienzo de otro producto más largo.
  for (const k of claves) {
    if (cab.some((h) => h.k === k)) continue
    lineas.forEach((l, i) => {
      const p = plano(l.replace(/^\W+/, ''))
      if (!p.startsWith(k) || p.length === k.length || !/^\s*(?:[-–—:(|·/]|\d)/.test(p.slice(k.length))) return
      if (claves.some((o) => o.length > k.length && p.startsWith(o))) return
      if (!cab.some((h) => h.i === i)) cab.push({ i, k })
    })
  }
  cab.sort((a, b) => a.i - b.i)
  if (cab.length === 0) {
    if (productos.length === 1) {
      const c = coberturasDeLineas(lineas)
      if (c.coberturas.length > 0) salida.set(plano(productos[0]!), c)
    }
    return salida
  }
  cab.forEach((h, n) => {
    const fin = cab[n + 1]?.i ?? lineas.length
    const c = coberturasDeLineas(lineas.slice(h.i + 1, fin))
    const previa = salida.get(h.k)
    if (c.coberturas.length > (previa?.coberturas.length ?? 0)) salida.set(h.k, c)
  })
  return salida
}

export const textoALineas = (t: string): string[] => t.split(/\r?\n/)

/**
 * v0.8.43 · POR QUÉ no se leyeron las garantías (para el aviso; solo recuentos y nombres de producto, sin datos personales). PURA.
 * Distingue «no hubo PDF» de «hubo PDF pero sin sección para este producto» (run 48b0df76: PDF bajado, solo un producto con sección).
 */
export function diagnosticoGarantiasMapfre(d: { pdfBytes: number | null; pdfLineas: number; deLaPdf: CoberturasPorProducto; deLaPantalla: CoberturasPorProducto; productos: readonly string[] }): string {
  const lista = (m: CoberturasPorProducto) => d.productos.filter((p) => (m.get(plano(p))?.coberturas.length ?? 0) > 0)
  const pdf = d.pdfBytes === null ? 'PDF del proyecto: no descargado' : d.pdfLineas === 0 ? `PDF del proyecto: descargado (${d.pdfBytes} bytes) pero sin texto legible` : `PDF del proyecto: descargado, ${d.pdfLineas} líneas de texto; con garantías de: ${lista(d.deLaPdf).map((p) => `«${p}»`).join(', ') || 'ningún producto'}`
  return `Diagnóstico de garantías · ${pdf}; pantalla «Coberturas» con garantías de: ${lista(d.deLaPantalla).map((p) => `«${p}»`).join(', ') || 'ningún producto'}.`
}

/** Nombre de producto de una oferta de Mapfre auto («Auto · TERCEROS» → «TERCEROS»). */
export const productoDeOferta = (o: Pick<OfertaNormalizada, 'producto'>): string => o.producto.replace(/^Auto\s*·\s*/i, '')

/**
 * Pone las garantías en cada oferta. Orden: PDF del proyecto > pantalla. Un producto sin garantías por ninguna vía queda con
 * `coberturas: []` y el aviso «coberturas no leídas» (asegura lo marca INCOMPLETO y avisa a Alberto; nunca se inventan). PURA.
 */
export function ofertasConGarantiasMapfre(
  ofertas: readonly OfertaNormalizada[],
  deLaPdf: CoberturasPorProducto,
  deLaPantalla: CoberturasPorProducto,
  diagnostico?: string,
): OfertaNormalizada[] {
  return ofertas.map((o) => {
    const k = plano(productoDeOferta(o))
    const pdf = deLaPdf.get(k)
    const pant = deLaPantalla.get(k)
    const elegida = pdf && pdf.coberturas.length > 0 ? { ...pdf, aviso: AVISO_COBERTURAS_PDF } : pant && pant.coberturas.length > 0 ? { ...pant, aviso: AVISO_COBERTURAS_PANTALLA } : null
    if (!elegida) return { ...o, avisos: [...o.avisos, AVISO_COBERTURAS_SIN_LEER, ...(diagnostico ? [diagnostico] : [])] }
    return { ...o, coberturas: elegida.coberturas, franquicias: elegida.franquicias, avisos: [...o.avisos, elegida.aviso] }
  })
}
