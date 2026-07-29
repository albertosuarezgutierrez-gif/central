// ────────────────────────────────────────────────────────────────────────────
// Referencia €/m² por zona vía la página de búsqueda de Fotocasa.
//
// La descarga y la mediana las hace la edge function `zona-fotocasa` (Supabase,
// región EU — Fotocasa geobloquea datacenters de EE.UU.); aquí vive lo puro:
// convertir el municipio de una subasta en el slug de zona que esa página
// espera (`/es/comprar/viviendas/<slug>/l`).
// ────────────────────────────────────────────────────────────────────────────

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

/** Respuesta de la edge function `zona-fotocasa` (contrato del puente). */
export interface ZonaPortal {
  totalZona: number | null
  muestra: number
  p25m2: number | null
  p50m2: number | null
  p75m2: number | null
}

/** Muestra mínima para fiarse de la mediana de una zona. */
export const MIN_MUESTRA_ZONA = 8
