// Media mensual de una actividad (ingresos o gastos por mes) para proyectar el cierre del año.
// Divide entre los MESES COMPLETOS transcurridos, no entre los meses que tienen entrada: si solo
// hubo un ingreso en 10 meses, el ritmo mensual es ingreso/10, no el ingreso entero.
// `null` = no hay ningún mes completo (no se sabe); 0 = hay meses y no hubo importe.
export function mediaMensualMesesCompletos(porMes: Record<string, number>, mesesCompletos: string[]): number | null {
  if (mesesCompletos.length === 0) return null
  let total = 0
  for (const k of mesesCompletos) total += porMes[k] ?? 0
  return total / mesesCompletos.length
}

/** ¿Hay alguna entrada en los meses completos? (distingue «sin dato» de «0 revisado»). */
export function hayEntradaEnMeses(porMes: Record<string, number>, mesesCompletos: string[]): boolean {
  return mesesCompletos.some(k => porMes[k] != null)
}

/** Neto proyectado de la actividad de Pilar para los meses restantes; null si no hay ni ingresos ni gastos registrados. */
export function proyectarNetoActividad(
  ingresosPorMes: Record<string, number>, gastosPorMes: Record<string, number>,
  mesesCompletos: string[], mesesRestantes: number,
): number | null {
  if (!hayEntradaEnMeses(ingresosPorMes, mesesCompletos) && !hayEntradaEnMeses(gastosPorMes, mesesCompletos)) return null
  const i = mediaMensualMesesCompletos(ingresosPorMes, mesesCompletos) ?? 0
  const g = mediaMensualMesesCompletos(gastosPorMes, mesesCompletos) ?? 0
  return (i - g) * mesesRestantes
}

/** Media mensual sobre meses completos, o null si no hay ninguna entrada en ellos (sin dato ≠ 0). */
export function mediaMensualOSinDato(porMes: Record<string, number>, mesesCompletos: string[]): number | null {
  return hayEntradaEnMeses(porMes, mesesCompletos) ? mediaMensualMesesCompletos(porMes, mesesCompletos) : null
}
