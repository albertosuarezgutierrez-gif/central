// Seguro de enfermedad del autónomo (correduría): gasto deducible de la actividad hasta 500 € POR PERSONA
// asegurada y año (art. 30.2.5ª LIRPF: el autónomo, su cónyuge e hijos <25 que convivan). Puro, sin BD.

/** Límite anual por persona asegurada (art. 30.2.5ª LIRPF). */
export const LIMITE_SEGURO_SALUD_POR_PERSONA = 500

/**
 * Personas cubiertas por la póliza ASISA que paga Alberto desde la correduría.
 * dato Alberto 03/11/2026: cónyuge + 2 hijos = 3 (Alberto no está asegurado). Baja prevista en diciembre de 2026:
 * el cargo de diciembre NO existirá (la proyección por media mensual de `estimarCierre` lo supondría: ver nota en el informe).
 */
export const ASEGURADOS_SALUD_ASISA = 3

export const tope = (asegurados: number = ASEGURADOS_SALUD_ASISA) => LIMITE_SEGURO_SALUD_POR_PERSONA * Math.max(0, Math.trunc(asegurados))

/**
 * Recorta el gasto de salud al tope anual, de forma acumulada mes a mes (el exceso se quita de los últimos meses).
 * Devuelve el `gastosPorMes` ajustado; el resto del gasto no se toca.
 */
export function aplicarTopeSalud(
  gastosPorMes: Record<string, number>, saludPorMes: Record<string, number>, asegurados: number = ASEGURADOS_SALUD_ASISA,
): Record<string, number> {
  const out = { ...gastosPorMes }
  let acumulado = 0
  const limite = tope(asegurados)
  for (const mes of Object.keys(saludPorMes).sort()) {
    const s = saludPorMes[mes]
    if (!(s > 0)) continue
    const permitido = Math.min(s, Math.max(0, limite - acumulado))
    acumulado += permitido
    const exceso = s - permitido
    if (exceso > 0) out[mes] = Math.max(0, (out[mes] ?? 0) - exceso)
  }
  return out
}
