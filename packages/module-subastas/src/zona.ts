// ────────────────────────────────────────────────────────────────────────────
// Referencia €/m² por zona vía la página de búsqueda de Fotocasa.
//
// La descarga y la mediana las hace la edge function `zona-fotocasa` (Supabase,
// región EU — Fotocasa geobloquea datacenters de EE.UU.); aquí vive lo puro:
// convertir el municipio de una subasta en el slug de zona que esa página
// espera (`/es/comprar/viviendas/<slug>/l`).
// ────────────────────────────────────────────────────────────────────────────

import { NUCLEOS_PLAYA_HUELVA } from './playa.ts'

/** Capitales de provincia andaluzas (y Madrid/Barcelona por si acaso): Fotocasa
 *  les añade `-capital` para distinguirlas de su provincia. */
const CAPITALES = new Set([
  'sevilla', 'huelva', 'cadiz', 'cordoba', 'malaga', 'granada', 'almeria', 'jaen',
  'madrid', 'barcelona', 'valencia', 'zaragoza', 'murcia',
])

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/[\s_]+/g, '-')
}

/**
 * Slug de zona de Fotocasa para un municipio. `null` si no hay municipio
 * utilizable (nunca se inventa una zona).
 *
 * «SEVILLA» → `sevilla-capital` · «Sanlúcar de Barrameda» → `sanlucar-de-barrameda`
 */
export function slugZonaFotocasa(municipio: string | null | undefined): string | null {
  if (!municipio) return null
  const slug = normalizar(municipio)
  if (slug.length < 3) return null
  return CAPITALES.has(slug) ? `${slug}-capital` : slug
}

/**
 * Slug de distrito dentro de una capital, a partir del nombre que publica el
 * propio Fotocasa en sus anuncios («Cerro - Amate» → `cerro-amate`).
 */
export function slugDistritoFotocasa(distrito: string | null | undefined): string | null {
  if (!distrito) return null
  const slug = normalizar(distrito).replace(/-+/g, '-')
  return slug.length >= 3 ? slug : null
}

/**
 * Slug de Fotocasa del NÚCLEO de playa citado en el texto de una subasta:
 * Matalascañas, La Antilla, Mazagón… tienen página PROPIA en el buscador
 * (verificado: `matalascanas` → 214 anuncios, mediana muy distinta de Almonte
 * pueblo). `null` si el texto no cita ningún núcleo — nunca se adivina.
 */
export function slugNucleoPlaya(municipio: string | null | undefined, descripcion?: string | null): string | null {
  const texto = normalizar(`${municipio ?? ''} ${descripcion ?? ''}`).replace(/-/g, ' ')
  for (const n of NUCLEOS_PLAYA_HUELVA) {
    if (texto.includes(n)) return n.replace(/\s+/g, '-')
  }
  return null
}

/** Respuesta de la edge function `zona-fotocasa` (contrato del puente). */
export interface ZonaPortal {
  totalZona: number | null
  muestra: number
  p25m2: number | null
  p50m2: number | null
  p75m2: number | null
  anuncios?: Array<{ cp: string | null; distrito: string | null }>
}

/** Muestra mínima para fiarse de la mediana de una zona. */
export const MIN_MUESTRA_ZONA = 8
