// Núcleo puro del consentimiento. Generaliza puedeMedir() de asegura-web (una sola
// categoría, statistics) a un mapa de categorías — housesevillana necesita `marketing`
// para el Meta Pixel de retargeting, que no es medición interna.
//
// La regla de fondo no cambia: sin credencial no hay nada que arrancar, y `undefined` en
// el consentimiento es «aún no ha contestado», nunca un sí.

export type Categoria = 'statistics' | 'marketing'

export type Consentimiento = Partial<Record<Categoria, boolean>>

export type ConfigProveedor = {
  categoria: Categoria
  /** Credencial pública del proveedor (id de GA4, key de PostHog, id de Meta Pixel...). */
  credencial: string
}

export function puedeCargar(
  consentimiento: Consentimiento | null | undefined,
  config: ConfigProveedor
): boolean {
  if (!config.credencial) return false
  return consentimiento?.[config.categoria] === true
}
