// ────────────────────────────────────────────────────────────────────────────
// Lente 🌊 de PREFERENCIAS de mercado: CASAS de playa baratas. PURO.
//
// Criterios de Alberto (09/08/2026, refinados el mismo día sobre la v1):
//   · CASAS, no pisos (chalet/adosado/casona valen; un piso de Gijón no).
//   · Tope 230.000€.
//   · Zonas: litoral de Asturias y Cantabria (alquiler vacacional que rinda
//     rápido) + Islantilla (Huelva) — allí un adosado también interesa.
//   · Sin señales de obra («buen estado» hasta donde el anuncio deja saber).
//   · ORDEN: primero las que YA HAN BAJADO de precio (vendedor que no vende
//     — margen para negociar más), luego las de PARTICULAR (sin agencia),
//     luego el descuento sobre su zona.
//
// La rebaja y el particular ORDENAN, no filtran: exigir rebaja escondería el
// anuncio recién publicado mal preciado, que es justo el que vuela primero.
//
// Por qué no basta con los chollos: en los municipios rurales del norte el
// corpus de alertas rara vez junta 3 comparables y la mediana de zona no
// existe — exigir un descuento convertiría la preferencia en una lente que
// nunca salta. Aquí la ZONA+tipo+precio son el criterio; si hay referencia
// €/m² se enseña el descuento, y si no se dice «sin referencia» — nunca se
// calla ni se inventa.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'
import {
  CHOLLO_DESCUENTO_SOSPECHOSO,
  esParcela,
  pareceRuina,
  referenciaZona,
  type Comparable,
  type ZonaPortalRef,
} from './comparables.ts'

/** Tope de precio de la preferencia (decisión de Alberto, 09/08/2026). */
export const TOPE_PREFERENTE_EUR = 230_000

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
 * Núcleos preferentes del SUR (petición de Alberto, 09/08/2026): Islantilla y
 * Matalascañas. Matalascañas entró tras medirla en vivo (09/08/2026, Fotocasa):
 * 216 anuncios en venta contra 133 de Islantilla y mediana ~14% más barata
 * (2.857 vs 3.308 €/m²) — más oferta, mejor precio de entrada, como intuía
 * Alberto. OJO: esto NO es la lente 🏖️ de `playa.ts` (esa es de SUBASTAS y
 * uso propio, cubre toda la costa de Huelva/Cádiz sin tope) — aquí es la
 * preferencia de compra de mercado, acotada a los núcleos que le interesan.
 */
export const NUCLEOS_PREFERENTES_SUR = ['islantilla', 'matalascanas'] as const

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

/** La costa norte como booleano, para etiquetar sin nombrar la costa. */
export function esCostaNorte(zona: string | null | undefined, titulo?: string | null): boolean {
  return costaNorteDe(zona, titulo) !== null
}

/** Nombre visible de cada zona preferente del sur (los slugs van sin ñ). */
export type ZonaPreferente = 'Asturias' | 'Cantabria' | 'Islantilla' | 'Matalascañas'

/** Zona de la preferencia completa: costa norte, Islantilla o Matalascañas. */
export function zonaPreferenteDe(
  zona: string | null | undefined,
  titulo?: string | null,
): ZonaPreferente | null {
  const norte = costaNorteDe(zona, titulo)
  if (norte) return norte
  const texto = norm(`${zona ?? ''} ${titulo ?? ''}`)
  if (!texto) return null
  if (contieneTermino(texto, 'islantilla')) return 'Islantilla'
  if (contieneTermino(texto, 'matalascanas')) return 'Matalascañas'
  return null
}

/** ¿Está en alguna zona preferente? (para la etiqueta 🌊 de los chollos). */
export function esZonaPreferente(zona: string | null | undefined, titulo?: string | null): boolean {
  return zonaPreferenteDe(zona, titulo) !== null
}

/**
 * ¿El anuncio es una CASA (chalet/adosado/pareado/casona) y no un piso?
 * Se decide por el título, que el portal siempre encabeza con el tipo
 * («Casa o chalet independiente en…», «casa adosada en…», «Piso en…»).
 * Un dúplex/ático/planta baja sigue siendo un piso: fuera.
 */
export function esCasa(titulo: string | null | undefined): boolean {
  const t = norm(titulo ?? '')
  return /\b(casa|chalet|casona|villa|adosado|adosada|pareado|pareada|caserio)\b/.test(t)
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

/**
 * Colapsa los RE-LISTADOS del mismo portal: Idealista re-publica el mismo
 * anuncio con un `ref` nuevo (visto en prod el 09/08/2026: el piso de Ceares
 * salía DOS veces, refs 112188897 y 112233004, idénticos en todo lo demás).
 * Clave = portal + título + precio + superficie; se queda la PRIMERA
 * aparición (el corpus llega ordenado por visto_en DESC → la más reciente).
 * No intenta cruzar portales: el mismo inmueble en Idealista y Fotocasa
 * lleva títulos distintos y fusionarlos a ciegas daría falsos positivos.
 */
export function dedupeRelistados(comparables: Comparable[]): Comparable[] {
  const vistos = new Set<string>()
  const out: Comparable[] = []
  for (const c of comparables) {
    const clave = `${c.portal}|${norm(c.titulo)}|${c.precio}|${c.superficie ?? ''}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    out.push(c)
  }
  return out
}

export interface Preferente {
  comparable: Comparable
  costa: ZonaPreferente
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
 * CASAS ≤230.000€ de las zonas preferentes, sin señales de obra, con su
 * comparación de zona si existe. Orden: primero las que YA HAN BAJADO de
 * precio (más bajadas antes), luego las de particular, luego mayor descuento
 * (las sin referencia al final; a igualdad, más baratas primero).
 */
export function lentePreferentes(comparables: Comparable[], zonasPortal?: ZonaPortalRef[]): Preferente[] {
  const portalPorSlug = new Map((zonasPortal ?? []).map((z) => [z.slug, z]))
  const out: Preferente[] = []
  for (const c of dedupeRelistados(comparables)) {
    if (c.tipo !== 'vivienda' || !esCasa(c.titulo)) continue
    if (c.precio > TOPE_PREFERENTE_EUR) continue
    const costa = zonaPreferenteDe(c.zona, c.titulo)
    if (!costa || !sinSenalesDeObra(c)) continue

    let referencia: Preferente['referencia'] = null
    // Una parcela (>400 m²) puede ser una casa con finca: entra en la lente,
    // pero su €/m² mide suelo y no se compara con medianas de vivienda.
    if (c.precioM2 != null && c.precioM2 > 0 && !esParcela(c)) {
      const resto = comparables.filter((x) => x.refAnuncio !== c.refAnuncio)
      const ref = referenciaZona(c, resto, portalPorSlug)
      if (ref) {
        const descuento = 1 - c.precioM2 / ref.precioM2Zona
        // Un «descuento» de derribo ES una señal de obra aunque el anuncio
        // calle: nadie vende una casa EN PIE a mitad de mercado (caso Llanes
        // 111790643, que en la primera prueba real salió el PRIMERO de la
        // lente con −73% y sin aviso). Fuera de la lente: si aun pagando
        // levantarla siguiera barata, ya sale por el camino de los chollos
        // (que aplica ese peaje); si no, es una ruina a precio de suelo y no
        // es la preferencia (buen estado).
        if (descuento > CHOLLO_DESCUENTO_SOSPECHOSO) continue
        referencia = { ...ref, descuento }
      }
    }
    out.push({ comparable: c, costa, referencia })
  }
  return out.sort((a, b) => {
    // «Sobre todo que ya hayan tenido rebaja»: el vendedor que baja no vende,
    // y quien no vende negocia. Manda el nº de bajadas.
    const ba = a.comparable.bajadas ?? 0
    const bb = b.comparable.bajadas ?? 0
    if (ba !== bb) return bb - ba
    // Luego el particular: negociación directa, sin comisión de agencia.
    const pa = a.comparable.esParticular === true ? 1 : 0
    const pb = b.comparable.esParticular === true ? 1 : 0
    if (pa !== pb) return pb - pa
    const da = a.referencia?.descuento ?? -Infinity
    const db = b.referencia?.descuento ?? -Infinity
    if (da !== db) return db - da
    return a.comparable.precio - b.comparable.precio
  })
}
