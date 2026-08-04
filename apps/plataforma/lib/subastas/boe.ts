// ────────────────────────────────────────────────────────────────────────────
// Adaptador de la fuente BOE. Corre en el servidor (Vercel), donde hay salida a
// boe.es — desde una sesión de Claude el egress lo bloquea con 403, igual que
// PLACSP, así que esto SOLO se valida en preview/producción.
//
// Vía: API oficial de datos abiertos (la misma familia que ya usa
// `lib/borme-ingesta.ts`, probada). Sumario diario → items de la sección de
// Anuncios cuyo título habla de subasta → XML del anuncio → parseo puro.
//
// ⚠️ La navegación del sumario (nombres de sección, anidamiento
// departamento/epígrafe) y las etiquetas de los campos del anuncio se confirman
// en la Fase 0 con `/api/subastas/boe-debug`. Hasta entonces esto es defensivo
// a propósito: acepta varias formas y NUNCA lanza si una no aparece.
// ────────────────────────────────────────────────────────────────────────────
import { XMLParser } from 'fast-xml-parser'
import {
  cargasConocidasDe,
  clasificarTipo,
  ejecutadoDe,
  esInmueble,
  extraerIdBoe,
  extraerIdSubasta,
  extraerRefCatastral,
  parseFechaEs,
  parseImporteEs,
  porcentajeSubastadoDe,
  sinVisitaDe,
  situacionPosesoriaDe,
  type SubastaInmueble,
} from '@central/module-subastas'
import { provinciaDeTexto } from '@central/module-concursos'

const BASE = 'https://www.boe.es/datosabiertos/api/boe'
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

export interface ItemSumario {
  id: string
  titulo: string
  urlXml: string | null
  urlHtml: string | null
}

function comoArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

/**
 * Aplana los items de una sección del sumario. El BOE anida
 * `seccion → departamento → epigrafe → item`, pero no siempre trae los tres
 * niveles, así que se recorren todos los que existan.
 */
function itemsDeSeccion(sec: any): any[] {
  const acc: any[] = [...comoArray(sec?.item)]
  for (const dep of comoArray(sec?.departamento)) {
    acc.push(...comoArray(dep?.item))
    for (const ep of comoArray(dep?.epigrafe)) acc.push(...comoArray(ep?.item))
  }
  return acc
}

/** Descarga el sumario de un día (YYYYMMDD) y devuelve los anuncios de subasta. */
export async function itemsDeSubasta(fechaYYYYMMDD: string): Promise<ItemSumario[]> {
  const r = await fetch(`${BASE}/sumario/${fechaYYYYMMDD}`, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`BOE sumario ${fechaYYYYMMDD}: HTTP ${r.status}`)
  const j = (await r.json()) as any

  const diario = comoArray(j?.data?.sumario?.diario ?? j?.sumario?.diario)
  const secciones = diario.flatMap((d: any) => comoArray(d?.seccion))

  return secciones
    .flatMap(itemsDeSeccion)
    .map((it: any) => ({
      id: String(it?.identificador ?? ''),
      titulo: String(it?.titulo ?? ''),
      urlXml: (it?.url_xml as string) ?? null,
      urlHtml: (it?.url_html as string) ?? (it?.url_pdf as string) ?? null,
    }))
    .filter((it) => it.id && /subasta/i.test(it.titulo))
}

/** Baja el XML de un anuncio y devuelve su texto plano concatenado. */
export async function textoAnuncio(urlXml: string): Promise<string> {
  const r = await fetch(urlXml)
  if (!r.ok) throw new Error(`BOE anuncio: HTTP ${r.status}`)
  const doc = xmlParser.parse(await r.text()) as any
  const ps = comoArray(doc?.documento?.texto?.p)
  return ps
    .map((p: any) => (typeof p === 'string' ? p : String(p?.['#text'] ?? '')))
    .join('\n')
    .trim()
}

/**
 * Busca el valor de un campo etiquetado dentro del texto del anuncio.
 * Los anuncios del BOE son texto corrido con pares "Etiqueta: valor", así que
 * se localiza la etiqueta y se toma hasta el final de la línea.
 */
function campo(texto: string, ...etiquetas: string[]): string | null {
  for (const et of etiquetas) {
    const re = new RegExp(`${et}\\s*[:\\-]\\s*([^\\n]+)`, 'i')
    const m = texto.match(re)
    if (m && m[1].trim()) return m[1].trim()
  }
  return null
}

/**
 * Convierte el texto de un anuncio en una `SubastaInmueble`. Puro salvo por el
 * `provinciaDeTexto` compartido. Devuelve `null` si no es un inmueble: el BOE
 * subasta coches y maquinaria en el mismo feed.
 */
export function normalizarAnuncio(item: ItemSumario, texto: string): SubastaInmueble | null {
  const completo = `${item.titulo}\n${texto}`
  if (!esInmueble(completo)) return null

  const identificador = extraerIdSubasta(completo)
  const boeId = extraerIdBoe(item.id) ?? extraerIdBoe(completo)
  // La clave estable es el id del portal; si no está, el del anuncio del BOE.
  const dedupeKey = identificador ?? boeId ?? item.id
  if (!dedupeKey) return null

  const cargasTexto = campo(texto, 'cargas')
  const descripcion = campo(texto, 'descripci[oó]n', 'bien', 'lote') ?? item.titulo

  return {
    dedupeKey,
    fuente: 'boe',
    identificador,
    tipo: clasificarTipo(completo, identificador),
    autoridad: campo(texto, 'autoridad gestora', 'juzgado', 'notar[ií]a', 'organismo'),
    provincia: provinciaDeTexto(completo) ?? null,
    municipio: campo(texto, 'municipio', 'localidad'),
    descripcion: descripcion.slice(0, 4000),
    url: item.urlHtml,

    fechaInicio: parseFechaEs(campo(texto, 'fecha de inicio', 'inicio de la subasta')),
    fechaFin: parseFechaEs(campo(texto, 'fecha de conclusi[oó]n', 'fin de la subasta', 'conclusi[oó]n')),

    valorSubasta: parseImporteEs(campo(texto, 'valor subasta', 'tipo de subasta', 'tipo de la subasta')),
    tasacion: parseImporteEs(campo(texto, 'tasaci[oó]n', 'valor de tasaci[oó]n')),
    pujaMinima: parseImporteEs(campo(texto, 'puja m[ií]nima')),
    tramos: parseImporteEs(campo(texto, 'tramos entre pujas', 'tramos')),
    deposito: parseImporteEs(campo(texto, 'importe del dep[oó]sito', 'dep[oó]sito')),

    cargas: parseImporteEs(cargasTexto),
    cargasTexto,
    cargasConocidas: cargasConocidasDe(texto),

    situacionPosesoria: situacionPosesoriaDe(texto),
    ejecutado: ejecutadoDe(completo),
    porcentajeSubastado: porcentajeSubastadoDe(texto),
    sinVisita: sinVisitaDe(texto),

    refCatastral: extraerRefCatastral(texto),
    lotes: (() => {
      const n = parseImporteEs(campo(texto, 'lotes', 'n[uú]mero de lotes'))
      return n != null && Number.isInteger(n) ? n : null
    })(),
  }
}
