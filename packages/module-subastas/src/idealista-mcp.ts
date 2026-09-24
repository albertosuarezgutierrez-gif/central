// ────────────────────────────────────────────────────────────────────────────
// Conector de Idealista en Claude (MCP `search_properties`) → Comparables. PURO.
//
// POR QUÉ EXISTE (24/09/2026): Alberto quita las alertas de correo de Idealista
// y las sustituye por una RUTINA de Claude que busca directamente con el
// conector (skill `idealista-radar`). Un conector solo se usa desde una sesión,
// no desde un cron: la rutina busca y manda los anuncios crudos a plataforma,
// que los pasa por aquí y los mete en el MISMO corpus `mercado_comparables`
// (mismo `upsertComparable`, mismo dedupe por `propertyCode` = id de
// `/inmueble/<id>/`). Fotocasa sigue entrando por correo.
//
// POR QUÉ NO SE REUTILIZA `comparablesDesdeApiIdealista`: la respuesta del
// conector no trae `municipality`/`neighborhood` ni `propertyType`, y ese
// mapeo titula «Vivienda en …» — con eso `esCasa` falla y la lente 🌊 (que es
// SOLO de casas) no vería ni un chalet. Aquí el título es el del portal.
//
// 🚨 LA ZONA LA DECIDE EL NÚCLEO BUSCADO, NO EL TÍTULO. Idealista titula los
// anuncios de Matalascañas como «Chalet adosado en Sector C, Centro, Almonte»
// (medido el 24/09/2026): con el municipio del título, la zona sería
// «Centro, Almonte», no casaría con la zona preferente y el radar callaría.
// La rutina declara el núcleo que buscó; el título solo aporta el barrio.
//
// 🚨 Y LO QUE CAE FUERA DEL NÚCLEO SE DESCARTA. La búsqueda es de texto libre:
// puede devolver anuncios de otro municipio. Un comparable de otro mercado en
// la mediana de una zona es peor que no tenerlo (misma regla que `CENTROS`),
// así que con coordenadas se exige estar dentro del radio del núcleo, y un
// anuncio SIN coordenadas no se da por bueno.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'
import { esCasa, type Comparable, type TipoComparable } from './comparables.ts'
import { centroBusquedaIdealista } from './idealista-api.ts'

/** Anuncio tal cual llega en `properties[]` del conector (solo lo que se usa). */
export interface AnuncioIdealistaMcp {
  propertyCode: string | number
  price: number
  size?: number | null
  rooms?: number | null
  priceByArea?: number | null
  status?: string | null
  latitude?: number | null
  longitude?: number | null
  suggestedTexts?: { title?: string | null; subtitle?: string | null } | null
  detailedType?: { typology?: string | null; subTypology?: string | null } | null
}

/** Holgura sobre el radio del núcleo: el borde de una urbanización no es otro mercado. */
export const IDEALISTA_MCP_HOLGURA_RADIO = 1.5

const TIPO_POR_TYPOLOGY: Record<string, TipoComparable> = {
  flat: 'vivienda',
  chalet: 'vivienda',
  countryhouse: 'vivienda',
  duplex: 'vivienda',
  penthouse: 'vivienda',
  studio: 'vivienda',
  garage: 'garaje',
  storageroom: 'garaje',
  premises: 'local',
  office: 'local',
  building: 'local',
  land: 'terreno',
}

function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

/**
 * Barrio a partir del título del portal: «<Tipo> en <calle>, <barrio>, <municipio>».
 * Solo se fía del penúltimo tramo cuando hay tres o más (con dos, el primero
 * suele ser la calle). Sin barrio → `null`, y la zona queda en el núcleo.
 */
export function barrioDesdeTitulo(titulo: string | null | undefined): string | null {
  const t = (titulo ?? '').trim()
  const i = t.indexOf(' en ')
  if (i < 0) return null
  const tramos = t.slice(i + 4).split(',').map((s) => s.trim()).filter(Boolean)
  return tramos.length >= 3 ? tramos[tramos.length - 2] : null
}

export interface ResultadoMcpIdealista {
  comparables: Comparable[]
  /** Refs descartadas por caer fuera del radio del núcleo o no traer coordenadas. */
  fueraDeZona: string[]
}

/**
 * Mapea los anuncios de UNA búsqueda del conector sobre `nucleo` (el núcleo de
 * playa buscado, p. ej. «Matalascañas»). Lanza si el núcleo no tiene centro en
 * `CENTROS`: sin centro no hay forma de saber qué anuncios son de su mercado.
 */
export function comparablesDesdeMcpIdealista(
  anuncios: readonly AnuncioIdealistaMcp[],
  nucleo: string,
): ResultadoMcpIdealista {
  const centro = centroBusquedaIdealista(nucleo)
  if (!centro) throw new Error(`núcleo sin centro de búsqueda: «${nucleo}» (añádelo a CENTROS)`)
  const radio = centro.distancia * IDEALISTA_MCP_HOLGURA_RADIO

  const comparables: Comparable[] = []
  const fueraDeZona: string[] = []
  const vistos = new Set<string>()
  for (const a of anuncios) {
    const ref = String(a.propertyCode ?? '').trim()
    const precio = Number(a.price)
    if (!ref || vistos.has(ref) || !Number.isFinite(precio) || precio < 1000) continue
    vistos.add(ref)

    const lat = Number(a.latitude)
    const lng = Number(a.longitude)
    if (a.latitude == null || a.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng)
      || distanciaMetros(centro, { lat, lng }) > radio) {
      fueraDeZona.push(ref)
      continue
    }

    const titulo = (a.suggestedTexts?.title ?? '').trim() || `Inmueble en ${nucleo}`
    const typology = norm(a.detailedType?.typology ?? '')
    // Sin typology reconocible, el título decide (el portal antepone el tipo).
    const tipo: TipoComparable = TIPO_POR_TYPOLOGY[typology] ?? (esCasa(titulo) ? 'vivienda' : 'otro')
    const superficie = a.size != null && Number(a.size) > 0 ? Number(a.size) : null
    const m2Portal = a.priceByArea != null && Number(a.priceByArea) > 0 ? Number(a.priceByArea) : null
    const barrio = barrioDesdeTitulo(titulo)
    const zona = barrio && norm(barrio) !== norm(nucleo) ? `${barrio}, ${nucleo}` : nucleo

    comparables.push({
      portal: 'idealista',
      refAnuncio: ref,
      titulo,
      tipo,
      zona,
      precio,
      superficie,
      habitaciones: a.rooms != null && Number(a.rooms) > 0 ? Number(a.rooms) : null,
      precioM2: m2Portal != null ? Math.round(m2Portal) : superficie ? Math.round(precio / superficie) : null,
      // URL canónica: la del conector lleva utm de asistente, y la canónica es
      // la misma que guardan los correos (dedupe visual en la ficha).
      url: `https://www.idealista.com/inmueble/${ref}/`,
      aReformar: a.status == null || !String(a.status).trim() ? null : norm(a.status) === 'renew',
    })
  }
  return { comparables, fueraDeZona }
}
