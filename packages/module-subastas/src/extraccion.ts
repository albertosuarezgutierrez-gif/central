// ────────────────────────────────────────────────────────────────────────────
// Extracción de datos estructurados desde la descripción registral del BOE.
// PURO.
//
// Estas descripciones son texto de registro de la propiedad, densas pero muy
// regulares: casi siempre traen tipo de bien, superficie, dirección, finca
// registral y registro. Sacarlo todo es lo que permite luego FILTRAR y educar
// al agente («solo viviendas de más de 100 m² en Dos Hermanas»), en vez de
// depender de una búsqueda de texto a ciegas.
//
// Todo devuelve `null` cuando no hay dato: no se rellena a ojo.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'
import { numeroAlFinal, palabrasANumero, superficieM2 } from './numeros-es.ts'

/**
 * Quita las tildes CONSERVANDO la longitud, para poder buscar sobre el texto
 * "plano" y devolver el trozo equivalente del ORIGINAL (con sus acentos).
 * Hace falta porque el BOE publica erratas reales: en una alerta de Sevilla
 * viene «egistro de la Propìedad» — sin la R inicial y con la tilde invertida.
 */
function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** Busca sobre el texto sin tildes y devuelve el grupo pedido DEL ORIGINAL. */
function buscar(texto: string, re: RegExp, grupo = 1): string | null {
  const plano = sinTildes(texto)
  const m = plano.match(re)
  if (!m || m[grupo] == null) return null
  // Los índices casan 1:1 con el original mientras la longitud se conserve.
  if (plano.length === texto.length) {
    const inicio = plano.indexOf(m[grupo], m.index ?? 0)
    if (inicio >= 0) return texto.slice(inicio, inicio + m[grupo].length)
  }
  return m[grupo]
}

export type TipoBien =
  | 'vivienda' | 'parcela' | 'local' | 'garaje' | 'trastero'
  | 'nave' | 'finca_rustica' | 'edificio' | 'otro'

/** Datos extraídos de la descripción. Todo opcional: el BOE no siempre publica. */
export interface DatosDescripcion {
  tipoBien: TipoBien
  superficie: number | null
  direccion: string | null
  fincaRegistral: string | null
  registroPropiedad: string | null
  dormitorios: number | null
  banos: number | null
  planta: string | null
  /** Cuota de participación en la propiedad horizontal, en %. */
  cuotaParticipacion: number | null
}

// El orden importa: «plaza de garaje en edificio» es garaje, no edificio.
const REGLAS_TIPO: Array<[RegExp, TipoBien]> = [
  [/\bgaraje|aparcamiento|plaza de estacionamiento/, 'garaje'],
  [/\btrastero/, 'trastero'],
  [/\bnave\b|industrial/, 'nave'],
  [/\bvivienda|\bpiso\b|apartamento|\bchalet|adosad|\bduplex|\batico|\bcasa\b/, 'vivienda'],
  [/\blocal\b|comercial/, 'local'],
  // `\bmonte\b` con ambos anclajes: sin el de inicio, «Belmonte de Miranda»
  // convertía una parcela urbana en finca rústica (caso real).
  [/rustica|olivar|\blabor\b|secano|regadio|\bmonte\b/, 'finca_rustica'],
  [/parcela|solar\b|terreno/, 'parcela'],
  [/edificio|inmueble completo/, 'edificio'],
]

export function tipoBien(texto: string | null | undefined): TipoBien {
  const t = norm(texto ?? '')
  if (!t) return 'otro'
  for (const [re, tipo] of REGLAS_TIPO) if (re.test(t)) return tipo
  return 'otro'
}

/**
 * Dirección: se busca el patrón registral «sita/o en …» o una vía explícita
 * (calle, avenida, plaza…). Se corta en el primer punto para no arrastrar
 * media descripción.
 */
export function direccion(texto: string | null | undefined): string | null {
  if (!texto) return null
  const limpio = texto.replace(/\s+/g, ' ').trim()

  const sita = limpio.match(/\bsit[ao]\s+en\s+([^.;]{5,160})/i)
  if (sita) return recortar(sita[1])

  const via = limpio.match(
    /\b(?:c\/|calle|avenida|avda\.?|plaza|paseo|camino|carretera|ctra\.?|urbanizacion|urbanización|barriada|poligono|polígono)\s+[^.;]{3,140}/i,
  )
  if (via) return recortar(via[0])

  return null
}

function recortar(s: string): string | null {
  const v = s.replace(/\s+/g, ' ').trim().replace(/[,;]$/, '')
  return v.length >= 4 ? v.slice(0, 160) : null
}

/** Número de finca registral: «finca registral 9670», «Registral 25.143», «FINCA 24.482». */
export function fincaRegistral(texto: string | null | undefined): string | null {
  if (!texto) return null
  const m = texto.match(/\b(?:finca\s+)?registral\s*(?:n[ºo°]?\.?\s*)?([\d.]+)/i)
    ?? texto.match(/\bfinca\s+(?:n[ºo°]?\.?\s*)?([\d.]{3,})/i)
  if (!m) return null
  return m[1].replace(/\.$/, '')
}

/**
 * Registro de la Propiedad al que pertenece la finca.
 * `r?egistro` a propósito: el BOE publica «egistro de la Propìedad» (errata
 * real vista en la alerta de Dos Hermanas del 24/07/2026).
 */
export function registroPropiedad(texto: string | null | undefined): string | null {
  if (!texto) return null
  const v =
    buscar(texto, /r?egistro\s+de\s+la\s+propiedad\s*(?:n[ºo°]?\.?\s*\d+\s*)?\s+de\s+([^.,;]{3,60})/i) ??
    buscar(texto, /inscrita\s+en\s+el\s+r?egistro\s+de\s+([^.,;]{3,60})/i)
  return v ? recortar(v) : null
}

/** Cuenta habitaciones escritas en cifra o en letra («tres dormitorios»). */
function cuenta(texto: string, sustantivos: string): number | null {
  const t = norm(texto)
  const re = new RegExp(`(\\d+|[a-z]+)\\s+(?:${sustantivos})`)
  const m = t.match(re)
  if (!m) return null
  if (/^\d+$/.test(m[1])) {
    const n = Number(m[1])
    return n > 0 && n < 100 ? n : null
  }
  const n = palabrasANumero(m[1])
  return n != null && n > 0 && n < 100 ? n : null
}

export function dormitorios(texto: string | null | undefined): number | null {
  return texto ? cuenta(texto, 'dormitorios?|habitaciones?') : null
}

export function banos(texto: string | null | undefined): number | null {
  return texto ? cuenta(texto, 'cuartos? de bano|banos?|aseos?') : null
}

/** Planta del inmueble, tal cual la nombra el registro. */
export function planta(texto: string | null | undefined): string | null {
  if (!texto) return null
  const t = norm(texto)
  if (/\bbajo\b/.test(t)) return 'bajo'
  if (/\batico\b/.test(t)) return 'ático'
  if (/\bsotano\b/.test(t)) return 'sótano'
  const m = t.match(/\b(?:en\s+)?(primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima)\s+planta/)
  if (m) return m[1]
  const n = t.match(/\bplanta\s+(\d{1,2})[ªa]?\b/)
  return n ? n[1] : null
}

/**
 * Cuota de participación en la propiedad horizontal, en %.
 * «tres enteros, ocho centésimas de otro por ciento» → 3,08 %.
 */
export function cuotaParticipacion(texto: string | null | undefined): number | null {
  if (!texto) return null
  const t = norm(texto)

  const letra = t.match(/([a-z\s]+?)\s+enteros?,?\s+([a-z\s]+?)\s+(centesimas?|milesimas?)/)
  if (letra) {
    // `numeroAlFinal`: la captura arrastra ruido por delante («es de tres»).
    const ent = numeroAlFinal(letra[1])
    const dec = numeroAlFinal(letra[2])
    if (ent != null) {
      const divisor = letra[3].startsWith('cent') ? 100 : 1000
      return Math.round((ent + (dec ?? 0) / divisor) * 10000) / 10000
    }
  }

  const cifra = t.match(/(\d+(?:[.,]\d+)?)\s*%/)
  if (cifra) {
    const n = Number(cifra[1].replace(',', '.'))
    if (Number.isFinite(n) && n > 0 && n <= 100) return n
  }
  return null
}

/** Pasada completa sobre una descripción registral. */
export function extraerDatos(texto: string | null | undefined): DatosDescripcion {
  return {
    tipoBien: tipoBien(texto),
    superficie: superficieM2(texto),
    direccion: direccion(texto ?? ''),
    fincaRegistral: fincaRegistral(texto),
    registroPropiedad: registroPropiedad(texto),
    dormitorios: dormitorios(texto),
    banos: banos(texto),
    planta: planta(texto),
    cuotaParticipacion: cuotaParticipacion(texto),
  }
}
