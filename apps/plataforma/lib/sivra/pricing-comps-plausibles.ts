// Plausibilidad de un comparable de mercado por €/plaza.
//
// Un comp a 44-104€ "para 12 personas" no es un piso entero: es el precio de UNA habitación
// (o un anuncio sin fecha) que el buscador devuelve igualmente al pedir aforo 12. Detectado el
// 17/08/2026 en House (364 filas, 36 fechas, todas fuente='serper'): fichas sin reseñas a
// 3,7-8,7€/plaza conviviendo con el mercado real a 14-34€/plaza. Ese ruido entra en los
// percentiles del motor (que no filtraba plausibilidad) y puede hundir buckets mensuales.
//
// El umbral se aplica sobre el precio y aforo CRUDOS del comp (antes de normalizar por
// pricing_factor_aforo). Verificado contra el corpus real de los 4 pisos (17/08/2026): el comp
// legítimo más barato queda a 12,0-13,5€/plaza (busto 27€/2p · duplex 48€/4p · luxury 74€/5p ·
// house 149€/12p), así que 12€/plaza separa limpio sin comerse mercado flojo real.
//
// Sin aforo declarado (NULL/0) el comp NO se juzga: un «no lo sé» no autoriza a descartar.
export const MIN_EUR_PLAZA_COMP = 12

export function esCompPlausible(precioNoche: number, plazasComp: number | null | undefined): boolean {
  if (plazasComp == null || plazasComp <= 0) return true
  if (!Number.isFinite(precioNoche) || precioNoche <= 0) return false
  return precioNoche >= MIN_EUR_PLAZA_COMP * plazasComp
}
