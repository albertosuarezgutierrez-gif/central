// ────────────────────────────────────────────────────────────────────────────
// API OFICIAL de Idealista (Search API v3.5) → Comparables. PURO.
//
// POR QUÉ EXISTE: las alertas de correo solo cubren las búsquedas guardadas que
// Alberto crea a mano, y el buscador de Fotocasa (edge proxy) es un apaño
// contra un portal que geobloquea. La API oficial de Idealista es la única vía
// LEGÍTIMA de consulta directa (developers.idealista.com: gratis, ~100
// llamadas/mes) y devuelve hasta 50 anuncios por llamada con precio, m²,
// habitaciones y €/m² ya calculado — el mismo dato que las alertas, sin
// depender de crear búsquedas guardadas por cada zona del BOE.
//
// Este archivo NO llama a la red: define el contrato de la respuesta, el mapeo
// a `Comparable` (mismo corpus `mercado_comparables`, mismo dedupe por
// `(portal, ref_anuncio)` — el `propertyCode` de la API ES el id de
// `/inmueble/<id>/` de los correos), los centros de búsqueda de las zonas
// vigiladas y el reparto del presupuesto mensual de llamadas.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'
import type { Comparable, TipoComparable } from './comparables.ts'

/** Anuncio tal cual llega en `elementList` de la Search API v3.5. */
export interface AnuncioIdealistaApi {
  propertyCode: string | number
  price: number
  propertyType?: string | null
  size?: number | null
  rooms?: number | null
  priceByArea?: number | null
  address?: string | null
  neighborhood?: string | null
  district?: string | null
  municipality?: string | null
  province?: string | null
  url?: string | null
  /** Estado del anuncio según el portal: 'good' | 'renew' (a reformar) | 'newdevelopment'. */
  status?: string | null
}

/** Respuesta de `POST /3.5/es/search` (solo los campos que se usan). */
export interface RespuestaIdealistaApi {
  elementList?: AnuncioIdealistaApi[]
  total?: number
  totalPages?: number
}

const TIPO_POR_PROPERTY_TYPE: Record<string, TipoComparable> = {
  flat: 'vivienda',
  chalet: 'vivienda',
  countryhouse: 'vivienda',
  duplex: 'vivienda',
  penthouse: 'vivienda',
  studio: 'vivienda',
  bedroom: 'vivienda',
  homes: 'vivienda',
  garage: 'garaje',
  storageroom: 'garaje',
  premises: 'local',
  office: 'local',
  building: 'local',
  land: 'terreno',
}

const ETIQUETA_POR_TIPO: Record<TipoComparable, string> = {
  vivienda: 'Vivienda',
  garaje: 'Garaje',
  local: 'Local',
  terreno: 'Terreno',
  otro: 'Inmueble',
}

/** Tipo del anuncio a partir del `propertyType` de la API. */
export function tipoDesdePropertyType(propertyType: string | null | undefined): TipoComparable {
  return TIPO_POR_PROPERTY_TYPE[norm(propertyType ?? '')] ?? 'otro'
}

/**
 * Mapea los anuncios de una respuesta de la API al mismo `Comparable` que
 * producen los parsers de correo — así entran al corpus por el MISMO upsert y
 * el `propertyCode` deduplica contra los ids ya vistos en las alertas.
 *
 * La zona se compone «barrio, municipio» (formato de los correos): la afinan
 * `zonasDeComparable`/`precioM2Zona` igual que al resto del corpus.
 */
export function comparablesDesdeApiIdealista(respuesta: RespuestaIdealistaApi): Comparable[] {
  const out: Comparable[] = []
  for (const a of respuesta.elementList ?? []) {
    const ref = String(a.propertyCode ?? '').trim()
    const precio = Number(a.price)
    if (!ref || !Number.isFinite(precio) || precio < 1000) continue

    const tipo = tipoDesdePropertyType(a.propertyType)
    const superficie = a.size != null && Number(a.size) > 0 ? Number(a.size) : null
    const zona =
      [a.neighborhood ?? a.district, a.municipality]
        .map((p) => (p ?? '').trim())
        .filter(Boolean)
        // «Centro, Sevilla» y no «Sevilla, Sevilla».
        .filter((p, i, todos) => todos.indexOf(p) === i)
        .join(', ') || null

    // La API da el €/m² ya calculado (`priceByArea`); es el dato del portal y
    // manda sobre el derivado — misma regla que el resumen diario del correo.
    const m2Portal = a.priceByArea != null && Number(a.priceByArea) > 0 ? Number(a.priceByArea) : null

    out.push({
      portal: 'idealista',
      refAnuncio: ref,
      titulo: `${ETIQUETA_POR_TIPO[tipo]} en ${(a.address ?? '').trim() || zona || 'zona sin nombre'}`,
      tipo,
      zona,
      precio,
      superficie,
      habitaciones: a.rooms != null && Number(a.rooms) > 0 ? Number(a.rooms) : null,
      precioM2: m2Portal != null ? Math.round(m2Portal) : superficie ? Math.round(precio / superficie) : null,
      url: (a.url ?? '').trim() || `https://www.idealista.com/inmueble/${ref}/`,
      // El estado que la alerta de correo NO trae: 'renew' = el propio anuncio
      // se declara a reformar (peaje de obra en `detectarChollos` aunque el
      // descuento sea moderado). Sin `status` → null, nunca «buen estado».
      aReformar: a.status == null || !String(a.status).trim() ? null : norm(a.status) === 'renew',
    })
  }
  return out
}

// ── Centros de búsqueda por zona vigilada ────────────────────────────────────
// La API busca por `center=lat,lng&distance=m`. Los municipios que Alberto
// vigila (los mismos de MUNICIPIOS_POR_PROVINCIA en geo.ts) se resuelven con
// esta tabla — determinista, sin geocodificador. Añadir una zona = una fila.

export interface CentroBusqueda {
  lat: number
  lng: number
  /** Radio de búsqueda en metros. */
  distancia: number
}

const CENTROS: Array<[RegExp, CentroBusqueda]> = [
  // Huelva — costa (el radar principal de Alberto)
  [/matalascanas/, { lat: 37.013, lng: -6.567, distancia: 4000 }],
  [/mazagon/, { lat: 37.131, lng: -6.837, distancia: 5000 }],
  [/punta umbria/, { lat: 37.181, lng: -6.966, distancia: 5000 }],
  [/isla cristina/, { lat: 37.199, lng: -7.321, distancia: 5000 }],
  [/islantilla/, { lat: 37.203, lng: -7.24, distancia: 4000 }],
  [/la antilla|lepe/, { lat: 37.208, lng: -7.176, distancia: 6000 }],
  [/el rompido/, { lat: 37.221, lng: -7.128, distancia: 4000 }],
  [/cartaya/, { lat: 37.283, lng: -7.152, distancia: 6000 }],
  [/ayamonte/, { lat: 37.213, lng: -7.407, distancia: 6000 }],
  [/aljaraque/, { lat: 37.269, lng: -7.021, distancia: 5000 }],
  [/almonte/, { lat: 37.264, lng: -6.516, distancia: 6000 }],
  [/moguer/, { lat: 37.274, lng: -6.838, distancia: 5000 }],
  [/palos de la frontera/, { lat: 37.229, lng: -6.894, distancia: 5000 }],
  [/huelva/, { lat: 37.261, lng: -6.944, distancia: 6000 }],
  // Cádiz — los núcleos de playa van ANTES que su municipio: Novo Sancti Petri
  // no está donde el casco de Chiclana, y una búsqueda mal centrada devuelve
  // comparables de otro mercado (que es peor que no tener ninguno).
  [/novo sancti petri|sancti petri|la barrosa/, { lat: 36.372, lng: -6.171, distancia: 4000 }],
  [/zahara de los atunes|atlanterra/, { lat: 36.138, lng: -5.847, distancia: 4000 }],
  [/los canos de meca|canos de meca/, { lat: 36.186, lng: -6.02, distancia: 3000 }],
  [/el palmar/, { lat: 36.226, lng: -6.032, distancia: 3000 }],
  [/bolonia|valdevaqueros/, { lat: 36.088, lng: -5.771, distancia: 4000 }],
  [/costa ballena/, { lat: 36.647, lng: -6.42, distancia: 4000 }],
  [/sotogrande|torreguadiaro/, { lat: 36.287, lng: -5.281, distancia: 5000 }],
  [/puerto sherry|valdelagrana/, { lat: 36.588, lng: -6.245, distancia: 4000 }],
  [/puerto de santa maria|puerto santamaria/, { lat: 36.601, lng: -6.233, distancia: 6000 }],
  [/jerez/, { lat: 36.685, lng: -6.126, distancia: 7000 }],
  [/chiclana/, { lat: 36.419, lng: -6.148, distancia: 7000 }],
  [/conil/, { lat: 36.277, lng: -6.088, distancia: 5000 }],
  [/rota\b/, { lat: 36.622, lng: -6.361, distancia: 5000 }],
  [/chipiona/, { lat: 36.737, lng: -6.435, distancia: 5000 }],
  [/sanlucar/, { lat: 36.778, lng: -6.352, distancia: 6000 }],
  [/barbate/, { lat: 36.192, lng: -5.921, distancia: 5000 }],
  [/vejer/, { lat: 36.252, lng: -5.966, distancia: 5000 }],
  [/tarifa/, { lat: 36.014, lng: -5.606, distancia: 6000 }],
  [/san fernando/, { lat: 36.462, lng: -6.199, distancia: 5000 }],
  [/puerto real/, { lat: 36.528, lng: -6.19, distancia: 5000 }],
  [/la linea de la concepcion|la linea\b/, { lat: 36.167, lng: -5.35, distancia: 5000 }],
  [/san roque/, { lat: 36.21, lng: -5.386, distancia: 6000 }],
  [/cadiz/, { lat: 36.529, lng: -6.293, distancia: 5000 }],
  // Sevilla
  [/dos hermanas/, { lat: 37.283, lng: -5.922, distancia: 6000 }],
  [/alcala de guadaira/, { lat: 37.338, lng: -5.845, distancia: 6000 }],
  [/mairena del aljarafe/, { lat: 37.344, lng: -6.064, distancia: 4000 }],
  [/camas\b/, { lat: 37.402, lng: -6.033, distancia: 4000 }],
  [/tomares/, { lat: 37.372, lng: -6.045, distancia: 4000 }],
  [/bormujos/, { lat: 37.373, lng: -6.072, distancia: 4000 }],
  [/utrera/, { lat: 37.185, lng: -5.781, distancia: 6000 }],
  [/sevilla/, { lat: 37.389, lng: -5.984, distancia: 7000 }],
  // Asturias
  [/belmonte de miranda/, { lat: 43.279, lng: -6.216, distancia: 8000 }],
  [/pravia/, { lat: 43.49, lng: -6.11, distancia: 7000 }],
  [/oviedo/, { lat: 43.362, lng: -5.849, distancia: 7000 }],
  [/gijon/, { lat: 43.532, lng: -5.661, distancia: 7000 }],
  [/aviles/, { lat: 43.556, lng: -5.925, distancia: 6000 }],
]

/**
 * Centro de búsqueda de un municipio/zona vigilada. `null` si la zona no está
 * en la tabla — la llamada NO se hace (mejor no gastar cuota en una búsqueda
 * mal centrada que inventar coordenadas).
 */
export function centroBusquedaIdealista(zona: string | null | undefined): CentroBusqueda | null {
  const z = norm(zona ?? '')
  if (!z) return null
  for (const [re, centro] of CENTROS) {
    if (re.test(z)) return centro
  }
  return null
}

// ── Presupuesto mensual de llamadas ──────────────────────────────────────────
// El tramo gratuito son ~100 búsquedas/mes. Se reserva margen para pruebas
// manuales y se raciona por pasada: el cron corre a diario y con 2-3 zonas por
// día + caché de 30 días por zona, el corpus entero se refresca sin agotar
// nunca la cuota.

export const IDEALISTA_LIMITE_MENSUAL = 100
/** Llamadas del mes que NUNCA gasta el cron (pruebas a mano, reintentos). */
export const IDEALISTA_MARGEN_MENSUAL = 15
/** Días que vale la búsqueda de una zona (los anuncios nuevos entran igual por las alertas). */
export const IDEALISTA_DIAS_CACHE_ZONA = 30

/**
 * Cuántas llamadas puede gastar UNA pasada del cron, dado lo ya consumido este
 * mes. Devuelve 0 cuando el presupuesto (menos el margen) está agotado.
 */
export function llamadasPermitidasIdealista(usadasEsteMes: number, maxPorPasada = 3): number {
  const restantes = IDEALISTA_LIMITE_MENSUAL - IDEALISTA_MARGEN_MENSUAL - Math.max(0, usadasEsteMes)
  return Math.max(0, Math.min(maxPorPasada, restantes))
}
