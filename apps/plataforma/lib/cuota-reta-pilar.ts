/**
 * Gasto RETA (cuota de autónomos) de la actividad de Pilar.
 * `fiscal_perfil.conyuge_cuota_autonomos` es la cotización ANUAL real (cuenta …5420, no conectada a la BD;
 * 2026: 661,49 €, baja de maternidad). El banco de la BD solo ve una parte (467,45 €): si hay perfil manda el perfil
 * y solo se cae al banco cuando el perfil es null (NULL = «no se sabe», nunca 0).
 */
export const ETIQUETA_CUOTA_PERFIL = 'del perfil: cuenta de Pilar no conectada'
export const ETIQUETA_CUOTA_BANCO = 'del banco'

export type CuotaRetaPilar = { importe: number; fuente: 'perfil' | 'banco'; etiqueta: string }

/**
 * @param perfilAnual  conyuge_cuota_autonomos (anual) o null
 * @param bancoPeriodo suma de movimientos `cuota_autonomos` del periodo
 * @param fraccionAnio 1 = año completo, 0.25 = trimestre; null = rango libre (no se puede prorratear ⇒ banco)
 */
export function cuotaRetaPilar(perfilAnual: number | null | undefined, bancoPeriodo: number, fraccionAnio: number | null): CuotaRetaPilar {
  if (perfilAnual != null && Number.isFinite(perfilAnual) && fraccionAnio != null && fraccionAnio > 0) {
    return { importe: Math.round(perfilAnual * fraccionAnio * 100) / 100, fuente: 'perfil', etiqueta: ETIQUETA_CUOTA_PERFIL }
  }
  return { importe: bancoPeriodo, fuente: 'banco', etiqueta: ETIQUETA_CUOTA_BANCO }
}
