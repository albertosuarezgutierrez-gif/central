// ────────────────────────────────────────────────────────────────────────────
// Perfil «casa vacacional» de Alberto (28/10/2026): UNA sola definición para
// todo lo que avisa por Telegram (subastas del BOE/Portal e Idealista).
//
// Regla del repo: dato ausente ≠ no cumple. `null`/`undefined` = «no se sabe» →
// el anuncio PASA como «pendiente» y se dice en el aviso; solo se descarta lo
// que CONSTA y no cumple. PURO: sin red ni BD.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'
import { coincideSubasta } from './radar.ts'
import type { CriteriosSubasta, Oportunidad, SubastaInmueble } from './types.ts'

/** Municipios de Sevilla/Huelva que le interesan (se comparan sin tildes ni mayúsculas). */
export const MUNICIPIOS_CASA_VACACIONAL: readonly string[] = [
  'Bormujos',
  'Espartinas',
  'Umbrete',
  'Sanlúcar la Mayor',
  'Benacazón',
  'Huévar del Aljarafe',
  'Carrión de los Céspedes',
  'Chucena',
  'Villanueva del Ariscal',
  'Olivares',
  'Almonte',
  'Pilas',
  'Hinojos',
]

export const PRECIO_MAX_CASA_VACACIONAL = 280_000
export const DORMITORIOS_MIN = 3
/** «Ideal»: destaca en el aviso, no descarta. */
export const DORMITORIOS_IDEAL = 4
export const BANOS_MIN = 2
export const PARCELA_MIN_M2 = 800

/**
 * Criterios para `coincideSubasta`. Piscina y parcela declaradas = basta UNO de
 * los dos (lo resuelve `coincideSubasta`). Sin `provincias` a propósito: la
 * lista de municipios ya acota, y exigir provincia descartaría anuncios que no
 * la traen.
 */
export const CRITERIOS_CASA_VACACIONAL: CriteriosSubasta = {
  municipios: [...MUNICIPIOS_CASA_VACACIONAL],
  soloUnifamiliar: true,
  dormitoriosMin: DORMITORIOS_MIN,
  banosMin: BANOS_MIN,
  superficieParcelaMin: PARCELA_MIN_M2,
  requierePiscina: true,
  precioMax: PRECIO_MAX_CASA_VACACIONAL,
}

export interface AnuncioCasa {
  /** Precio en €. null = no consta. */
  precio?: number | null
  /** Tipo de inmueble en texto libre («chalet», «piso»…). null/«otro» = no se sabe. */
  tipo?: string | null
  dormitorios?: number | null
  banos?: number | null
  /** true/false si consta; null = el anuncio calla. */
  piscina?: boolean | null
  /** m² de parcela si constan. */
  parcelaM2?: number | null
  municipio?: string | null
}

export interface EncajeCasa {
  encaja: boolean
  /** Lo que sí se comprobó y cumple. */
  motivos: string[]
  /** Lo que NO se pudo comprobar por falta de dato (no es «no cumple»). */
  pendientes: string[]
  descartadaPor?: string
}

const ES_CASA = /unifamiliar|chalet|adosad|paread|\bcasa\b|\bvilla\b|vivienda\s+independiente/
const NO_ES_CASA = /\bpiso\b|apartamento|\bduplex|\batico|\bestudio\b|\bloft\b|\blocal\b|garaje|trastero|\bnave\b|parcela|solar|terreno|\bfinca\b/

/** true/false si consta que es casa unifamiliar; null si no se sabe. */
export function esCasaUnifamiliarTexto(tipo: string | null | undefined): boolean | null {
  const t = norm(tipo ?? '')
  if (!t || t === 'otro') return null
  if (ES_CASA.test(t)) return true
  if (NO_ES_CASA.test(t)) return false
  return null
}

const MUNICIPIOS_NORM = new Set(MUNICIPIOS_CASA_VACACIONAL.map(norm))

/** true/false si el municipio está (o no) en la lista; null si no consta. */
export function municipioDelPerfil(municipio: string | null | undefined): boolean | null {
  const m = norm(municipio ?? '')
  if (!m) return null
  return MUNICIPIOS_NORM.has(m)
}

function precioOk(precio: number | null | undefined): boolean | null {
  return precio == null ? null : precio <= PRECIO_MAX_CASA_VACACIONAL
}

/**
 * Anuncio genérico (Idealista, etc.) contra el perfil. Un dato ausente deja
 * el anuncio en «pendiente»; solo descarta lo que consta y no cumple.
 */
export function encajaCasaVacacional(a: AnuncioCasa): EncajeCasa {
  const motivos: string[] = []
  const pendientes: string[] = []
  const descarta = (razon: string): EncajeCasa => ({ encaja: false, motivos, pendientes, descartadaPor: razon })

  const p = precioOk(a.precio)
  if (p === false) return descarta(`precio por encima de ${PRECIO_MAX_CASA_VACACIONAL}`)
  if (p === null) pendientes.push('precio')
  else motivos.push('Precio dentro de tope')

  const mun = municipioDelPerfil(a.municipio)
  if (mun === false) return descarta(`municipio fuera de la lista (${a.municipio})`)
  if (mun === null) pendientes.push('municipio')
  else motivos.push(`Municipio ${a.municipio}`)

  const casa = esCasaUnifamiliarTexto(a.tipo)
  if (casa === false) return descarta(`no es casa unifamiliar (${a.tipo})`)
  if (casa === null) pendientes.push('tipo (casa/chalet)')
  else motivos.push('Casa/chalet')

  const minimo = (valor: number | null | undefined, min: number, nombre: string): string | null => {
    if (valor == null) { pendientes.push(nombre); return null }
    if (valor < min) return `${nombre} ${valor} por debajo del mínimo (${min})`
    motivos.push(`${valor} ${nombre}`)
    return null
  }
  const dorm = minimo(a.dormitorios, DORMITORIOS_MIN, 'dormitorios')
  if (dorm) return descarta(dorm)
  const ban = minimo(a.banos, BANOS_MIN, 'baños')
  if (ban) return descarta(ban)

  // Piscina O parcela ≥ 800 m²: basta uno. Descarta solo si AMBOS constan y fallan.
  const parcelaOk = a.parcelaM2 == null ? null : a.parcelaM2 >= PARCELA_MIN_M2
  if (a.piscina === true) motivos.push('Con piscina')
  if (parcelaOk === true) motivos.push(`Parcela ${a.parcelaM2} m²`)
  if (a.piscina !== true && parcelaOk !== true) {
    if (a.piscina === false && parcelaOk === false) return descarta('sin piscina y parcela por debajo del mínimo')
    pendientes.push('piscina o parcela')
  }

  return { encaja: true, motivos, pendientes }
}

/**
 * Subasta contra el perfil. Usa `coincideSubasta` con los criterios del perfil,
 * pero el TOPE DE PRECIO se evalúa aquí: `coincideSubasta` descarta una subasta
 * sin valor publicado cuando hay tope, y para el perfil un precio ausente es
 * «pendiente», no «no cumple».
 */
export function encajaSubastaCasaVacacional(s: SubastaInmueble, op?: Oportunidad | null): EncajeCasa {
  const { precioMax: _omitido, ...criterios } = CRITERIOS_CASA_VACACIONAL
  const c = coincideSubasta(s, criterios, op)
  if (!c.casa) return { encaja: false, motivos: c.motivos, pendientes: c.pendientes ?? [], descartadaPor: c.descartadaPor }
  const pendientes = [...(c.pendientes ?? [])]
  const motivos = [...c.motivos]
  const p = precioOk(s.valorSubasta)
  if (p === false) return { encaja: false, motivos, pendientes, descartadaPor: `valor de subasta por encima de ${PRECIO_MAX_CASA_VACACIONAL}` }
  if (p === null) pendientes.push('precio')
  return { encaja: true, motivos, pendientes }
}

/** Fusiona claves ya avisadas con las nuevas (sin duplicados, tope `max`, las más recientes al final). */
export function fusionarAvisadas(previas: readonly string[], nuevas: readonly string[], max = 500): string[] {
  return [...previas.filter((k) => !nuevas.includes(k)), ...nuevas].slice(-max)
}
