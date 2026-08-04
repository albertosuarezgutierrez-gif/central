// ────────────────────────────────────────────────────────────────────────────
// Parseo PURO de las páginas de patrimonio de la Junta de Andalucía (Drupal,
// renderizado en servidor — verificado contra el HTML real el 29/07/2026):
//
//   · subastas-abierto.html      → subastas con plazo de solicitudes abierto
//   · inmueb-adqu-directa.html   → lotes desiertos en ADQUISICIÓN DIRECTA por
//                                  precio mínimo (venta directa, no subasta)
//
// El contenido vive en un único bloque `field--name-field-contenido` con un
// patrón muy regular por lote:
//
//   LOTE 23.- SOLAR EN CALLE ALPECHÍN, 41, DE OSUNA (SEVILLA).
//   Precio de adquisición: 84.944,08 €
//   Presentación solicitudes: antes del día 29 de enero de 2027.
//   [Ficha del inmueble](…pdf)
//
// Estado vacío verificado: «Sin subastas y procedimientos abiertos actualmente».
// Las capitales van sin paréntesis («…, DE ALMERÍA.») — municipio = provincia.
//
// Lo que estas páginas NO publican: superficie, cargas, situación posesoria.
// Eso queda a null y el scoring lo declara — nunca se inventa.
// ────────────────────────────────────────────────────────────────────────────
import { decodificarHtml } from './email-boe.ts'
import type { SubastaInmueble } from './types.ts'

/** Un lote publicado por la D.G. de Patrimonio. */
export interface LoteJunta {
  /** «1», «2bis», «23»… tal y como lo numera la página. */
  lote: string
  /** Descripción completa del lote, sin el prefijo «LOTE N.-». */
  descripcion: string
  municipio: string | null
  provincia: string | null
  /** «Precio de adquisición» (directa) o tipo de licitación (subasta). */
  precio: number | null
  /** Fin del plazo de presentación de solicitudes (ISO), si se publica. */
  plazoHasta: string | null
  /** PDF «Ficha del inmueble», absoluto, si lo hay. */
  urlFicha: string | null
}

const BASE = 'https://www.juntadeandalucia.es'

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
}

/** «29 de enero de 2027» → «2027-01-29T00:00:00». */
export function fechaTextualEs(texto: string | null | undefined): string | null {
  if (!texto) return null
  const m = texto
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/)
  if (!m) return null
  const mes = MESES[m[2]]
  if (!mes) return null
  const dia = Number(m[1])
  if (dia < 1 || dia > 31) return null
  return `${m[3]}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T00:00:00`
}

/** Importe «84.944,08 €» → 84944.08 (formato español estricto). */
function importeEurosEs(texto: string): number | null {
  const m = texto.match(/([\d][\d.]*(?:,\d+)?)\s*€/)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** Recorta el bloque de contenido Drupal donde viven los lotes. */
function bloqueContenido(html: string): string {
  const ini = html.indexOf('field--name-field-contenido')
  if (ini < 0) return ''
  const fin = html.indexOf('field-informacion-de-autoria', ini)
  return fin > ini ? html.slice(ini, fin) : html.slice(ini)
}

/**
 * HTML → texto plano por líneas (una por <p>). El marcador de párrafo es un
 * token NO blanco () porque `decodificarHtml` colapsa todo el espacio —
 * un \n directo desaparecería y las líneas se fundirían.
 */
function aTexto(html: string): string {
  const plano = html
    .replace(/<(?:p|h\d|li|br)[^>]*>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>]*$/, '') // etiqueta cortada al final del trozo
  return decodificarHtml(plano)
    .split('')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

/** Municipio y provincia desde el final de la descripción del lote. */
export function municipioDeLote(descripcion: string): { municipio: string | null; provincia: string | null } {
  // Con paréntesis: «…, DE OSUNA (SEVILLA).» / «…DE JEREZ DE LA FRONTERA (CÁDIZ).»
  const conProv = descripcion.match(/[,\s]DE\s+([^,()]+?)\s*\(([^)]+)\)\s*\.?\s*$/i)
  if (conProv) return { municipio: limpiar(conProv[1]), provincia: limpiar(conProv[2]) }
  // Sin paréntesis = capital: «…, DE ALMERÍA.» — municipio y provincia coinciden.
  const capital = descripcion.match(/[,\s]DE\s+([^,()]+?)\s*\.?\s*$/i)
  if (capital) {
    const nombre = limpiar(capital[1])
    return { municipio: nombre, provincia: nombre }
  }
  return { municipio: null, provincia: null }
}

function limpiar(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Extrae los lotes de una página de patrimonio de la Junta. Devuelve `[]`
 * tanto si la página declara que no hay nada («Sin subastas…») como si el
 * bloque de contenido no aparece — el llamante decide si eso es un error.
 */
export function parsearPatrimonioJunta(html: string): LoteJunta[] {
  const bloque = bloqueContenido(html)
  if (!bloque) return []

  // Los trozos empiezan en cada «LOTE N.-»; lo anterior es la nota informativa.
  const trozos = bloque.split(/(?=LOTE\s+\d)/)
  const lotes: LoteJunta[] = []
  for (const trozo of trozos.slice(1)) {
    const texto = aTexto(trozo)
    const cab = texto.match(/^LOTE\s+(\d+\s*(?:bis|ter|quater)?)\s*\.?-\s*([^\n]+)/i)
    if (!cab) continue
    const descripcion = limpiar(cab[2])
    const plazo = texto.match(/antes del d[ií]a\s+([^\n.]+)/i)
    const ficha = trozo.match(/href="([^"]+\.pdf[^"]*)"/i)
    lotes.push({
      lote: cab[1].replace(/\s+/g, ''),
      descripcion,
      ...municipioDeLote(descripcion),
      precio: importeEurosEs(texto),
      plazoHasta: plazo ? fechaTextualEs(plazo[1]) : null,
      urlFicha: ficha ? (ficha[1].startsWith('http') ? ficha[1] : BASE + ficha[1]) : null,
    })
  }
  return lotes
}

/**
 * Lote → tipo del corpus. La adquisición directa es venta a precio fijo
 * (`venta_adjudicado`, como los adjudicados de un servicer); lo publicado en
 * subastas-abierto es subasta administrativa de patrimonio autonómico.
 */
export function loteASubasta(
  l: LoteJunta,
  origen: 'directa' | 'subasta',
  urlPagina: string,
): SubastaInmueble {
  return {
    dedupeKey: `JUNTA-${origen === 'directa' ? 'DIRECTA' : 'SUBASTA'}-LOTE-${l.lote}`,
    fuente: 'junta',
    identificador: `LOTE ${l.lote}`,
    tipo: origen === 'directa' ? 'venta_adjudicado' : 'administrativa',
    autoridad: 'Junta de Andalucía — D.G. de Patrimonio',
    provincia: l.provincia,
    municipio: l.municipio,
    descripcion: l.descripcion,
    url: l.urlFicha ?? urlPagina,
    fechaInicio: null,
    fechaFin: l.plazoHasta,
    valorSubasta: l.precio,
    tasacion: null,
    pujaMinima: null,
    tramos: null,
    deposito: null,
    cargas: null,
    cargasTexto: null,
    // La página no publica cargas ni posesión: se declara desconocido y el
    // scoring aplicará sus avisos — la ficha PDF es la que manda.
    cargasConocidas: false,
    situacionPosesoria: 'desconocida',
    ejecutado: 'desconocido',
    porcentajeSubastado: null,
    sinVisita: false,
    refCatastral: null,
    superficie: null,
    anioConstruccion: null,
    valorReferencia: null,
    precioM2Mercado: null,
    muestraMercado: null,
    lotes: null,
  }
}
