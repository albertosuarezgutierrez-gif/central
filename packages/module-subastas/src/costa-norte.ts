// ────────────────────────────────────────────────────────────────────────────
// Lente 🌊 costa norte: viviendas cerca de playa en el Cantábrico (Asturias y
// Cantabria) sin señales de obra. PURO.
//
// Preferencia de Alberto (09/08/2026, a raíz de una casona en Colunga a
// ~914€/m²): inmuebles en buen estado en municipios de playa del norte, que
// puedan ponerse a rendir como alquiler vacacional sin pasar por una reforma.
// A diferencia de la lente 🏖️ del sur (uso propio), esta es de INVERSIÓN.
//
// Por qué no basta con los chollos: en los municipios rurales del norte el
// corpus de alertas rara vez junta 3 comparables y la mediana de zona no
// existe, así que exigir un descuento ≥20% convertiría la preferencia en una
// lente que nunca salta. Aquí la ZONA es el criterio; si hay referencia €/m²
// se enseña el descuento, y si no se dice «sin referencia» — nunca se calla
// ni se inventa.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'
import {
  esParcela,
  pareceRuina,
  referenciaZona,
  type Comparable,
  type ZonaPortalRef,
} from './comparables.ts'

/**
 * Municipios del litoral asturiano (término municipal completo, de este a
 * oeste). Avilés se deja FUERA a propósito (ría industrial, no turismo de
 * playa — mismo criterio que Algeciras en la lente del sur); Castrillón sí
 * entra y cubre Salinas. Los términos van ya normalizados (sin tildes ni ñ).
 */
export const MUNICIPIOS_COSTA_ASTURIAS = [
  'ribadedeva',
  'llanes',
  'ribadesella',
  'caravia',
  'colunga',
  'villaviciosa',
  'gijon',
  'carreno',
  'gozon',
  'castrillon',
  'soto del barco',
  'muros de nalon',
  'cudillero',
  'valdes',
  'navia',
  'coana',
  'el franco',
  'tapia de casariego',
  'castropol',
] as const

/**
 * Núcleos de playa asturianos que los anuncios citan aunque el municipio vaya
 * en otro tramo de la zona (Lastres y La Griega son Colunga, Celorio y Niembro
 * son Llanes, Tazones es Villaviciosa…). «Salinas» NO está: es nombre de
 * playa/urbanización en media España y colaría falsos positivos del sur —
 * su municipio (Castrillón) ya lo cubre.
 */
export const NUCLEOS_COSTA_ASTURIAS = [
  'lastres',
  'la griega',
  'la isla',
  'rodiles',
  'tazones',
  'luanco',
  'candas',
  'luarca',
  'cadavedo',
  'celorio',
  'niembro',
  'andrin',
  'pendueles',
  'vidiago',
] as const

/**
 * Municipios del litoral cántabro. Fuera a propósito Camargo y El Astillero
 * (bahía industrial) y Colindres (marisma/puerto pesquero, sin playa propia).
 */
export const MUNICIPIOS_COSTA_CANTABRIA = [
  'val de san vicente',
  'san vicente de la barquera',
  'valdaliga',
  'comillas',
  'ruiloba',
  'alfoz de lloredo',
  'santillana del mar',
  'suances',
  'miengo',
  'pielagos',
  'santa cruz de bezana',
  'santander',
  'ribamontan al mar',
  'bareyo',
  'arnuero',
  'noja',
  'santona',
  'laredo',
  'castro urdiales',
] as const

/**
 * Núcleos de playa cántabros (Somo y Loredo son Ribamontán al Mar, Ajo es
 * Bareyo, Mogro es Miengo, Liencres es Piélagos…). «Isla» (Arnuero) NO está:
 * como palabra suelta casa con «Isla Cristina» y su municipio ya lo cubre.
 */
export const NUCLEOS_COSTA_CANTABRIA = [
  'somo',
  'loredo',
  'langre',
  'galizano',
  'ajo',
  'mogro',
  'liencres',
  'cobreces',
  'oyambre',
  'berria',
] as const

/**
 * ¿El texto contiene el término como PALABRA completa? Un `includes` a secas
 * ya mordió con núcleos cortos («isla» dentro de «Islantilla»): se exige
 * frontera de palabra a ambos lados.
 */
function contieneTermino(texto: string, termino: string): boolean {
  const i = texto.indexOf(termino)
  if (i < 0) return false
  // Puede aparecer varias veces; basta con que UNA tenga fronteras limpias.
  let desde = i
  while (desde >= 0) {
    const antes = desde === 0 ? '' : texto[desde - 1]
    const despues = texto[desde + termino.length] ?? ''
    if (!/[a-z0-9]/.test(antes) && !/[a-z0-9]/.test(despues)) return true
    desde = texto.indexOf(termino, desde + 1)
  }
  return false
}

/**
 * Costa a la que pertenece el anuncio, mirando su zona y su título (las
 * alertas no traen municipio estructurado: la zona es texto libre del portal,
 * «Barrio d'Arriba, Colunga»). `null` = no es costa norte. Los municipios
 * grandes (Llanes, Villaviciosa…) incluyen interior — mejor un falso positivo
 * que perderse Lastres, mismo criterio que la lente del sur.
 */
export function costaNorteDe(zona: string | null | undefined, titulo?: string | null): 'Asturias' | 'Cantabria' | null {
  const texto = norm(`${zona ?? ''} ${titulo ?? ''}`)
  if (!texto) return null
  const terminos = (xs: readonly string[]) => xs.some((x) => contieneTermino(texto, x))
  if (terminos(MUNICIPIOS_COSTA_ASTURIAS) || terminos(NUCLEOS_COSTA_ASTURIAS)) return 'Asturias'
  if (terminos(MUNICIPIOS_COSTA_CANTABRIA) || terminos(NUCLEOS_COSTA_CANTABRIA)) return 'Cantabria'
  return null
}

/** La lente completa como booleano, para etiquetar (🌊) sin nombrar la costa. */
export function esCostaNorte(zona: string | null | undefined, titulo?: string | null): boolean {
  return costaNorteDe(zona, titulo) !== null
}

/**
 * ¿Nada en el anuncio delata obra? OJO: esto NO confirma «buen estado» — el
 * correo de alerta no trae la descripción ni fotos. Dice exactamente que ni el
 * título confiesa reforma ni la API lo marcó `a reformar`; el estado real se
 * verifica en el anuncio (y en la visita), nunca aquí.
 */
export function sinSenalesDeObra(c: Comparable): boolean {
  return !pareceRuina(c.titulo) && c.aReformar !== true
}

export interface PreferenteNorte {
  comparable: Comparable
  costa: 'Asturias' | 'Cantabria'
  /**
   * Comparación con su zona cuando el corpus la da. `null` = SIN referencia
   * €/m² todavía (pocas alertas en esa zona) — que no es «a precio de
   * mercado»: simplemente no se sabe, y la ficha lo dice así.
   */
  referencia: {
    zona: string
    precioM2Zona: number
    muestra: number
    /** 1 − precioM2/mediana. Puede ser NEGATIVO (más caro que su zona). */
    descuento: number
    fuente: 'portal' | 'alertas'
  } | null
}

/**
 * Viviendas de la costa norte sin señales de obra, con su comparación de zona
 * si existe. Ordenadas: mayor descuento primero, las sin referencia al final
 * (dentro de cada grupo, más baratas primero).
 */
export function lenteCostaNorte(comparables: Comparable[], zonasPortal?: ZonaPortalRef[]): PreferenteNorte[] {
  const portalPorSlug = new Map((zonasPortal ?? []).map((z) => [z.slug, z]))
  const out: PreferenteNorte[] = []
  for (const c of comparables) {
    if (c.tipo !== 'vivienda') continue
    const costa = costaNorteDe(c.zona, c.titulo)
    if (!costa || !sinSenalesDeObra(c)) continue

    let referencia: PreferenteNorte['referencia'] = null
    // Una parcela (>400 m²) puede ser una casa con finca: entra en la lente,
    // pero su €/m² mide suelo y no se compara con medianas de vivienda.
    if (c.precioM2 != null && c.precioM2 > 0 && !esParcela(c)) {
      const resto = comparables.filter((x) => x.refAnuncio !== c.refAnuncio)
      const ref = referenciaZona(c, resto, portalPorSlug)
      if (ref) referencia = { ...ref, descuento: 1 - c.precioM2 / ref.precioM2Zona }
    }
    out.push({ comparable: c, costa, referencia })
  }
  return out.sort((a, b) => {
    const da = a.referencia?.descuento ?? -Infinity
    const db = b.referencia?.descuento ?? -Infinity
    if (da !== db) return db - da
    return a.comparable.precio - b.comparable.precio
  })
}
