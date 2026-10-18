/**
 * Cuándo el aviso «Hay que avisar antes del …» sube encima del grid de la ficha (18/10/2026).
 * PURO: recibe el resultado de `alertaVencimiento` (ya calculado con un `hoy`), no lee el reloj.
 *
 * Alberto: el aviso suelto ocupaba sitio arriba aunque faltaran meses. Sube SOLO cuando quedan
 * ≤ 60 días para la fecha de aviso (o ya pasó / hay algo raro que decir); si falta más, se queda
 * como chip dentro de la tarjeta de su póliza en «Con nosotros».
 */
export const DIAS_AVISO_ARRIBA = 60

export function avisoVaArriba(a: { estado: string; diasParaAvisar: number | null }): boolean {
  // Solo el caso «en plazo y lejos» se aparta; vencido, aviso pasado y desconocido se siguen diciendo arriba.
  if (a.estado !== 'en_plazo') return true
  // En plazo sin número de días no debería pasar: ante la duda, arriba (el estado conservador).
  if (a.diasParaAvisar === null) return true
  return a.diasParaAvisar <= DIAS_AVISO_ARRIBA
}
