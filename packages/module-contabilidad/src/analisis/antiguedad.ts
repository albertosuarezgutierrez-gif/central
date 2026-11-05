// Antigüedad de saldos (clientes 43x / proveedores 40x-41x) y vencimientos estimados. PURO.
// Una PARTIDA es lo que comparten los apuntes de una misma cuenta y un mismo `documento` (la referencia de la factura): la venta la abre
// y el cobro (con el mismo `documento`) la cierra. Sin `documento` no se puede casar: queda como partida «sin documento» de su cuenta.
import { aFechaISO, diasEntre, sumarDias } from './periodos.ts'

export type PartidaDoc = { cuenta: string; documento: string | null; desde: string; debe: number; haber: number }
export type TipoSaldo = 'clientes' | 'proveedores'
export type Tramo = '0-30' | '31-60' | '61-90' | '+90'

export type FilaAntiguedad = { cuenta: string; documento: string | null; desde: string; dias: number; tramo: Tramo; importe: number }
export type Antiguedad = {
  filas: FilaAntiguedad[]
  tramos: Record<Tramo, number>
  total: number
  /** Partidas con saldo CONTRARIO (anticipos, cobros sin factura casada…): no se compensan con las abiertas, se muestran aparte. */
  aFavor: FilaAntiguedad[]
}

const PREFIJOS: Record<TipoSaldo, string[]> = { clientes: ['43'], proveedores: ['40', '41'] }

export function tramoDe(dias: number): Tramo {
  return dias <= 30 ? '0-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '+90'
}

/** `null` si ningún apunte toca esas cuentas (sin datos); si los hay, el reparto por tramos a fecha `hoy`. */
export function antiguedadSaldos(partidas: readonly PartidaDoc[], tipo: TipoSaldo, hoy: Date): Antiguedad | null {
  const hoyISO = aFechaISO(hoy)
  const mias = partidas.filter((p) => PREFIJOS[tipo].some((x) => p.cuenta.startsWith(x)))
  if (mias.length === 0) return null
  const filas: FilaAntiguedad[] = []
  const aFavor: FilaAntiguedad[] = []
  const tramos: Record<Tramo, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 }
  for (const p of mias) {
    const saldo = tipo === 'clientes' ? p.debe - p.haber : p.haber - p.debe
    if (saldo === 0) continue
    const dias = Math.max(0, diasEntre(p.desde, hoyISO))
    const fila: FilaAntiguedad = { cuenta: p.cuenta, documento: p.documento, desde: p.desde, dias, tramo: tramoDe(dias), importe: Math.abs(saldo) }
    if (saldo > 0) { filas.push(fila); tramos[fila.tramo] += saldo } else aFavor.push(fila)
  }
  filas.sort((a, b) => b.dias - a.dias || b.importe - a.importe)
  aFavor.sort((a, b) => b.dias - a.dias)
  return { filas, tramos, total: filas.reduce((t, f) => t + f.importe, 0), aFavor }
}

export type Vencimiento = { fecha: string; /** + cobro esperado, − pago esperado. */ importe: number; ref?: string }

/**
 * Vencimientos ESTIMADOS de las partidas abiertas: fecha de la partida + `plazoDias` (el modelo de hechos no trae vencimiento; es una
 * ESTIMACIÓN y la pantalla lo dice). Cobros en positivo, pagos en negativo. Lo ya vencido se marca con su fecha tal cual (la previsión
 * lo cuenta en el día 0).
 */
export function vencimientosEstimados(partidas: readonly PartidaDoc[], plazoDias = 30): Vencimiento[] {
  if (!Number.isInteger(plazoDias) || plazoDias < 0 || plazoDias > 365) throw new RangeError('plazoDias entre 0 y 365')
  const salida: Vencimiento[] = []
  for (const p of partidas) {
    const esCliente = p.cuenta.startsWith('43')
    const esProveedor = p.cuenta.startsWith('40') || p.cuenta.startsWith('41')
    if (!esCliente && !esProveedor) continue
    const saldo = esCliente ? p.debe - p.haber : p.haber - p.debe
    if (saldo <= 0) continue
    salida.push({ fecha: sumarDias(p.desde, plazoDias), importe: esCliente ? saldo : -saldo, ...(p.documento ? { ref: p.documento } : {}) })
  }
  return salida.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}
