// Lógica de pipeline del CRM. Funciones puras sobre los tipos genéricos (sin BD).
import type { EstadoOportunidad, Oportunidad, ResumenPipeline } from './types'

// Probabilidad por defecto según estado (si la oportunidad no trae `probabilidadPct`).
export const PROBABILIDAD_POR_ESTADO: Record<EstadoOportunidad, number> = {
  nuevo: 10,
  contactado: 25,
  propuesta: 50,
  negociacion: 70,
  ganado: 100,
  perdido: 0,
}

export const ESTADOS: EstadoOportunidad[] = [
  'nuevo',
  'contactado',
  'propuesta',
  'negociacion',
  'ganado',
  'perdido',
]

export const ESTADOS_ABIERTOS: EstadoOportunidad[] = [
  'nuevo',
  'contactado',
  'propuesta',
  'negociacion',
]

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Probabilidad efectiva (0..100): la explícita si existe, si no la del estado. */
export function probabilidad(op: Oportunidad): number {
  if (op.probabilidadPct != null) return clamp(op.probabilidadPct, 0, 100)
  return PROBABILIDAD_POR_ESTADO[op.estado]
}

/** Valor ponderado del pipeline = Σ valorEstimado * (probabilidad/100). */
export function valorPonderado(ops: Oportunidad[]): number {
  return round2(
    ops.reduce((s, op) => s + (op.valorEstimado ?? 0) * (probabilidad(op) / 100), 0),
  )
}

function mismoMes(iso: string | null | undefined, ref: Date): boolean {
  if (!iso) return false
  const d = new Date(iso)
  return d.getUTCFullYear() === ref.getUTCFullYear() && d.getUTCMonth() === ref.getUTCMonth()
}

/** Resumen agregado para un panel de pipeline. */
export function resumenPipeline(ops: Oportunidad[], ref: Date = new Date()): ResumenPipeline {
  const porEstado = ESTADOS.reduce(
    (acc, e) => {
      acc[e] = { conteo: 0, valor: 0 }
      return acc
    },
    {} as ResumenPipeline['porEstado'],
  )

  for (const op of ops) {
    const slot = porEstado[op.estado]
    if (!slot) continue
    slot.conteo += 1
    slot.valor = round2(slot.valor + (op.valorEstimado ?? 0))
  }

  const abiertas = ops.filter((op) => ESTADOS_ABIERTOS.includes(op.estado)).length
  const ganadasMes = ops.filter(
    (op) => op.estado === 'ganado' && mismoMes(op.updatedAt ?? op.createdAt, ref),
  ).length

  return { porEstado, valorPonderado: valorPonderado(ops), abiertas, ganadasMes }
}
