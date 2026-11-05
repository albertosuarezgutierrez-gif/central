// Cobros por medio (efectivo, bizum, transferencia, tarjeta, otro). PURO. `medio: null` = el hecho no decía el medio («sin indicar»).
import { MEDIOS_PAGO, type MedioPago } from '../partida/hechos.ts'

export type FilaMedio = { medio: MedioPago | null; importe: number; n: number }
export type CobrosPorMedio = { filas: FilaMedio[]; total: number }

/** Reparte los cobros por medio, de mayor a menor importe. `null` si no hay ningún cobro (sin datos, no 0). */
export function cobrosPorMedio(cobros: readonly { medio: string | null; importe: number; n?: number }[]): CobrosPorMedio | null {
  if (cobros.length === 0) return null
  const m = new Map<MedioPago | null, FilaMedio>()
  for (const c of cobros) {
    const medio = (MEDIOS_PAGO as readonly string[]).includes(c.medio ?? '') ? (c.medio as MedioPago) : null
    const x = m.get(medio) ?? { medio, importe: 0, n: 0 }
    x.importe += c.importe; x.n += c.n ?? 1
    m.set(medio, x)
  }
  const filas = [...m.values()].sort((a, b) => b.importe - a.importe)
  return { filas, total: filas.reduce((t, f) => t + f.importe, 0) }
}

export const ETIQUETA_MEDIO: Readonly<Record<MedioPago, string>> = {
  efectivo: 'Efectivo', bizum: 'Bizum', transferencia: 'Transferencia', tarjeta: 'Tarjeta', otro: 'Otro',
}
