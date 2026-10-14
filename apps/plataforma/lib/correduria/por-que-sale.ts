/**
 * «Por qué sale» un lead en la lista de WhatsApp de Vencimientos (14/10/2026): una línea legible con
 * lo que YA tiene la fila, para que Alberto sepa de dónde viene la fecha ANTES de escribir y pueda
 * corregirla cuando el cliente contesta («no vence en octubre, sino en junio»). Puro y sin red.
 * Solo dice lo que consta: ramo/compañía sin dato se omiten, nunca se inventan. La fecha de un lead
 * SIEMPRE es estimada (aniversario de la póliza anterior): nadie la ha confirmado.
 */
export type EntradaPorQueSale = {
  ramo: string | null
  aseguradora: string | null
  /** YYYY-MM-DD, próximo aniversario. */
  vencimientoEstimado: string
  dias: number
}

const fechaCorta = (iso: string): string | null =>
  /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null

export function textoPorQueSale(l: EntradaPorQueSale): string {
  const partes: string[] = []
  partes.push(l.ramo?.trim() || 'ramo sin dato')
  if (l.aseguradora?.trim()) partes.push(`con ${l.aseguradora.trim()}`)
  const f = fechaCorta(l.vencimientoEstimado)
  partes.push(f ? `vence ${f} (estimada, nadie la ha confirmado)` : 'vencimiento ilegible')
  partes.push(l.dias === 0 ? 'hoy' : l.dias === 1 ? 'en 1 día' : `en ${l.dias} días`)
  return partes.join(' · ')
}
