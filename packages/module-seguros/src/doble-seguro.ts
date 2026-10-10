/**
 * «Póliza sustituida que sigue viva» → posible DOBLE SEGURO (03/10/2026). Puro: sin BD, sin red.
 *
 * Una sustitución registrada (vieja → nueva) no anula la vieja: hay que pedírselo a su compañía. Si la
 * vieja sigue en un estado vigente y cubre (vencimiento) o cobra (recibo) bastante DESPUÉS del efecto de
 * la nueva, el cliente paga dos seguros del mismo riesgo. Caso real: GPAFS0900547 (C0468, vence 09/09/2027)
 * → 61048939 (C0109, efecto 17/09/2026).
 *
 * Tolerancia (`DOBLE_SEGURO_DIAS_TOLERANCIA`, la misma que `solicitudPorSustitucion`): un cambio a
 * vencimiento (la nueva empieza como mucho 30 días antes de que venza la vieja) es lo normal y NO avisa.
 * Falta de fecha = «no se sabe» → sin aviso (no se inventa), nunca «no hay doble seguro».
 * El texto NO lleva datos personales: solo nº de póliza y compañía.
 */
import { esEstadoVigente } from './vigencia.ts'

export const DOBLE_SEGURO_DIAS_TOLERANCIA = 30

export type ViejaParaDobleSeguro = {
  aseguradora: string
  numeroPoliza: string | null
  estado: string
  /** `YYYY-MM-DD`. `null` = no consta. */
  fechaVencimiento: string | null
  /** Efecto (`YYYY-MM-DD`) del recibo más tardío de la vieja que NO está anulado ni devuelto. `null` = ninguno/no consta. */
  fechaEfectoUltimoRecibo: string | null
}
/** `estado` de la nueva: si no está vigente (anulada, rechazada…) no hay doble seguro. */
export type NuevaParaDobleSeguro = { fechaEfecto: string | null; estado: string }

export type AvisoDobleSeguro = {
  motivos: Array<'vencimiento_posterior' | 'recibo_posterior'>
  texto: string
}

function dia(iso: string | null): number | null {
  if (iso === null) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(t) ? null : Math.floor(t / 86_400_000)
}

export function avisoDobleSeguro(vieja: ViejaParaDobleSeguro, nueva: NuevaParaDobleSeguro): AvisoDobleSeguro | null {
  const efecto = dia(nueva.fechaEfecto)
  if (efecto === null || !esEstadoVigente(vieja.estado) || !esEstadoVigente(nueva.estado)) return null
  const corte = efecto + DOBLE_SEGURO_DIAS_TOLERANCIA
  const motivos: AvisoDobleSeguro['motivos'] = []
  const venc = dia(vieja.fechaVencimiento)
  if (venc !== null && venc > corte) motivos.push('vencimiento_posterior')
  const rec = dia(vieja.fechaEfectoUltimoRecibo)
  if (rec !== null && rec > corte) motivos.push('recibo_posterior')
  if (motivos.length === 0) return null
  const num = vieja.numeroPoliza?.trim() || 'la póliza sustituida'
  return { motivos, texto: `posible doble seguro: pedir anulación de ${num} a ${vieja.aseguradora}` }
}
