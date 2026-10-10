/**
 * En qué orden se enseñan los resultados del buscador. Puro, sin BD.
 *
 * Buscando «campa» lo que se quiere casi siempre es la ficha con la que HAY
 * algo que hacer, no el lead del volcado de 2016. Por eso van primero las
 * fichas con una oportunidad activa, luego la cartera viva y al final el
 * volcado histórico.
 *
 * 🚨 «No se sabe» nunca sube por encima de lo sabido: una ficha con las
 * oportunidades sin contar (`null`) o la vitalidad `desconocida` no se trata
 * como si tuviera oportunidad ni como viva. Y a igualdad se respeta el orden
 * que traía la consulta (alfabético): el sort es estable.
 */

export type ParaOrdenar = {
  oportunidadesAbiertas: number | null
  vitalidad: 'viva' | 'historica' | 'sin_fecha' | 'desconocida'
}

const PESO_VITALIDAD: Record<ParaOrdenar['vitalidad'], number> = {
  viva: 0,
  sin_fecha: 1,
  desconocida: 2,
  historica: 3,
}

export function ordenarPorInteres<T extends ParaOrdenar>(hallazgos: readonly T[]): T[] {
  const conOportunidad = (h: T) => (h.oportunidadesAbiertas !== null && h.oportunidadesAbiertas > 0 ? 0 : 1)
  return [...hallazgos].sort(
    (a, b) => conOportunidad(a) - conOportunidad(b) || PESO_VITALIDAD[a.vitalidad] - PESO_VITALIDAD[b.vitalidad],
  )
}
