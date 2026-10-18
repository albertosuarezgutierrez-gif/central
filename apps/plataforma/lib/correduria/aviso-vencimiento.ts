/**
 * Cuándo el aviso «Hay que avisar antes del …» sube encima del grid de la ficha (18/10/2026).
 * PURO: recibe el resultado de `alertaVencimiento` (ya calculado con un `hoy`), no lee el reloj.
 *
 * Alberto: el aviso suelto ocupaba sitio arriba aunque faltaran meses. Sube SOLO cuando quedan
 * ≤ 60 días para la fecha de aviso (o ya pasó / hay algo raro que decir); si falta más, se queda
 * como chip dentro de la tarjeta de su póliza en «Con nosotros».
 */
export const DIAS_AVISO_ARRIBA = 60

/** Estados con los que la póliza ya no es «vigente» en su tarjeta (ni lleva chip de aviso). */
const ESTADOS_SIN_CHIP = ['cancelada', 'vencida', 'competencia', 'fin_riesgo']

/**
 * ¿La tarjeta de esta póliza («Con nosotros») pinta el chip «Avisar antes del …»? UNA sola regla
 * para la tarjeta (SegurosCliente) y la cabecera (Cabecera): si se desincronizan, el aviso
 * desaparece de los dos sitios. Chip = viva, vigente, no sustituida, con fecha, y la tarjeta no es
 * oportunidad (`eliminable`) ni volcado histórico. Si no se sabe, `false` (el aviso sube).
 */
export function polizaLlevaChipAviso(
  p: { viva: boolean; estado: string; sustituida?: boolean; fechaVencimiento: string | null },
  tarjeta: { eliminable?: boolean; historica?: boolean } = {},
): boolean {
  if (!p.viva || tarjeta.eliminable || tarjeta.historica) return false
  if (ESTADOS_SIN_CHIP.includes((p.estado ?? '').trim())) return false
  if (p.sustituida === true) return false
  return Boolean(p.fechaVencimiento)
}

/**
 * `tieneChip`: la póliza del aviso lleva chip en su tarjeta (`polizaLlevaChipAviso`). Solo entonces
 * se aparta de arriba; sin chip, o sin poder saberlo, el aviso se queda arriba.
 */
export function avisoVaArriba(a: { estado: string; diasParaAvisar: number | null }, { tieneChip }: { tieneChip: boolean }): boolean {
  // Solo el caso «en plazo y lejos» se aparta; vencido, aviso pasado y desconocido se siguen diciendo arriba.
  if (a.estado !== 'en_plazo') return true
  // En plazo sin número de días no debería pasar: ante la duda, arriba (el estado conservador).
  if (a.diasParaAvisar === null) return true
  // Sin chip en su tarjeta, apartarlo lo borraría de la ficha.
  if (!tieneChip) return true
  return a.diasParaAvisar <= DIAS_AVISO_ARRIBA
}
