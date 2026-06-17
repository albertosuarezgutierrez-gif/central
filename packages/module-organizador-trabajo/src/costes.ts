export interface ElaboracionCosteable {
  ingredientes: { coste: number }[]  // coste ya calculado de cada ingrediente usado
  minutos: number                    // tiempo de elaboración
  coste_min: number                  // coste del minuto de trabajo (mano de obra)
  unidades?: number                  // raciones/uds producidas (para el coste unitario)
}

export interface CosteElaboracion {
  coste_total: number
  coste_unitario: number | null      // null si no se indican unidades (granel: fondos, salsas)
}

/**
 * Costea una elaboración (incluye sus mermas/fondos como producto propio):
 * coste = Σ ingredientes + minutos × coste del minuto. Si hay unidades, reparte
 * en coste por ración. El "cada bolsa de fondo sale a tanto" de la reunión.
 */
export function costearElaboracion(e: ElaboracionCosteable): CosteElaboracion {
  const materia = e.ingredientes.reduce((acc, i) => acc + i.coste, 0)
  const coste_total = materia + e.minutos * e.coste_min
  const coste_unitario = e.unidades && e.unidades > 0 ? coste_total / e.unidades : null
  return { coste_total, coste_unitario }
}

export interface EntradaRentabilidad {
  ingresos: number
  coste_materia: number
  coste_personal: number
  umbral_pct?: number   // margen mínimo deseado (%). Si se indica, marca bajo_umbral.
}

export interface RentabilidadEvento {
  coste_total: number
  margen: number
  margen_pct: number    // margen / ingresos × 100 (0 si no hay ingresos)
  en_perdidas: boolean
  bajo_umbral: boolean  // margen_pct < umbral_pct (false si no se indicó umbral)
}

/**
 * Rentabilidad de un evento: ingresos − (materia + personal). Marca pérdidas y,
 * si se da un umbral, avisa cuando el margen no llega. Para detectar la boda que
 * "solo deja 5 €" antes de cerrarla.
 */
export function rentabilidadEvento(e: EntradaRentabilidad): RentabilidadEvento {
  const coste_total = e.coste_materia + e.coste_personal
  const margen = e.ingresos - coste_total
  const margen_pct = e.ingresos > 0 ? (margen / e.ingresos) * 100 : 0
  return {
    coste_total,
    margen,
    margen_pct,
    en_perdidas: margen < 0,
    bajo_umbral: e.umbral_pct != null && margen_pct < e.umbral_pct,
  }
}
