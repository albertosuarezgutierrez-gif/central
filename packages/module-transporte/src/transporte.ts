// Lógica pura del módulo TRANSPORTE (sin BD). Precio del servicio (importe pactado o derivado del
// coste de los portes + margen), máquina de estados de fulfillment, resumen y consolidación
// intercompany. Compone @central/module-flota: el coste de cada porte lo calcula flota; aquí se
// agrega al nivel de servicio.
import { costePorteEstimado, costePorteReal } from '@central/module-flota'
import type { Porte, Vehiculo } from '@central/module-flota'
import type {
  EstadoServicio,
  OperacionIntercompanyDeTransporte,
  ResumenServicios,
  ServicioTransporte,
} from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export const ESTADOS: EstadoServicio[] = [
  'presupuestado',
  'planificado',
  'en_curso',
  'entregado',
  'facturado',
  'cancelado',
]
// "Activos" = comprometidos y en ejecución (excluye presupuesto sin confirmar, facturado y cancelado).
export const ESTADOS_ACTIVOS: EstadoServicio[] = ['planificado', 'en_curso', 'entregado']

// Máquina de estados del servicio: presupuestado → planificado → en_curso → entregado → facturado.
// Se puede cancelar mientras no se haya facturado.
export const TRANSICIONES: Record<EstadoServicio, EstadoServicio[]> = {
  presupuestado: ['planificado', 'cancelado'],
  planificado: ['en_curso', 'cancelado'],
  en_curso: ['entregado', 'cancelado'],
  entregado: ['facturado', 'cancelado'],
  facturado: [],
  cancelado: [],
}

export function puedeTransicionar(desde: EstadoServicio, hacia: EstadoServicio): boolean {
  return TRANSICIONES[desde]?.includes(hacia) ?? false
}

/** Transición inmutable: devuelve un nuevo ServicioTransporte o lanza si la transición no es válida. */
export function transicionar(s: ServicioTransporte, hacia: EstadoServicio): ServicioTransporte {
  if (!puedeTransicionar(s.estado, hacia)) {
    throw new Error(`Transición de servicio inválida: ${s.estado} → ${hacia}`)
  }
  return { ...s, estado: hacia }
}

/**
 * Importe de cierre del servicio al cliente (sin IVA) = importe pactado − descuento (nunca negativo).
 * Es lo que se factura y la base de la eliminación intercompany. Si `importe` es null devuelve 0
 * (todavía sin precio cerrado; usar `sugerirImporte()` para derivarlo del coste de los portes).
 */
export function importeServicio(s: ServicioTransporte): number {
  const base = s.importe ?? 0
  const desc = Math.max(0, s.descuentoEur ?? 0)
  return round2(Math.max(0, base - desc))
}

/** Coste de un porte: real si hay datos reales (km/coste reales), si no el estimado. */
function costePorte(porte: Porte, vehiculo: Vehiculo): number {
  const tieneReal = porte.costeReal != null || porte.kmReales != null
  return tieneReal ? costePorteReal(porte, vehiculo) : costePorteEstimado(porte, vehiculo)
}

/**
 * Coste operativo del servicio = Σ coste de sus portes (los referenciados por `porteIds`).
 * `vehiculos` se usa como catálogo para resolver `porte.vehiculoId`; los portes sin vehículo
 * conocido se ignoran (no se puede calcular su coste).
 */
export function costeDePortes(
  s: ServicioTransporte,
  portes: Porte[],
  vehiculos: Vehiculo[],
): number {
  const ids = new Set(s.porteIds)
  const vehById = new Map(vehiculos.map((v) => [v.id, v]))
  let total = 0
  for (const p of portes) {
    if (!ids.has(p.id)) continue
    const v = vehById.get(p.vehiculoId)
    if (!v) continue
    total += costePorte(p, v)
  }
  return round2(total)
}

/** Importe sugerido para el servicio = coste de los portes × (1 + margen). margen por defecto 20%. */
export function sugerirImporte(
  s: ServicioTransporte,
  portes: Porte[],
  vehiculos: Vehiculo[],
  margen = 0.2,
): number {
  return round2(costeDePortes(s, portes, vehiculos) * (1 + Math.max(0, margen)))
}

/**
 * Margen del servicio = importe de cierre − coste de los portes. `margenPct` relativo al importe
 * (0 si no hay importe). Útil para el cuadro de rentabilidad por servicio.
 */
export function margenServicio(
  s: ServicioTransporte,
  portes: Porte[],
  vehiculos: Vehiculo[],
): { ingreso: number; coste: number; margen: number; margenPct: number } {
  const ingreso = importeServicio(s)
  const coste = costeDePortes(s, portes, vehiculos)
  const margen = round2(ingreso - coste)
  const margenPct = ingreso > 0 ? round2((margen / ingreso) * 100) : 0
  return { ingreso, coste, margen, margenPct }
}

// ─── Intercompany ──────────────────────────────────────────────────────────────
/** Un servicio es intercompany si es interno (no a terceros) y va entre dos sociedades distintas del grupo. */
export function esIntercompany(s: ServicioTransporte): boolean {
  return (
    !s.aTerceros &&
    !!s.sociedadOrigenId &&
    !!s.sociedadDestinoId &&
    s.sociedadOrigenId !== s.sociedadDestinoId
  )
}

/** Suma del importe de los servicios internos (lo que se elimina en el consolidado del holding). */
export function totalIntercompany(servicios: ServicioTransporte[]): number {
  return round2(
    servicios
      .filter((s) => s.estado !== 'cancelado' && esIntercompany(s))
      .reduce((acc, s) => acc + importeServicio(s), 0),
  )
}

/** Proyecta un servicio interno a la forma OperacionIntercompany (sin acoplar al módulo). null si no aplica. */
export function operacionIntercompanyDe(
  s: ServicioTransporte,
): OperacionIntercompanyDeTransporte | null {
  if (!esIntercompany(s)) return null
  return {
    sociedadOrigenId: s.sociedadOrigenId!,
    sociedadDestinoId: s.sociedadDestinoId!,
    importe: importeServicio(s),
    tipo: 'flota',
    parent: { parentId: s.id, parentType: 'porte' },
  }
}

// ─── Resumen ─────────────────────────────────────────────────────────────────
export function resumenServicios(servicios: ServicioTransporte[]): ResumenServicios {
  const porEstado: Record<EstadoServicio, number> = {
    presupuestado: 0,
    planificado: 0,
    en_curso: 0,
    entregado: 0,
    facturado: 0,
    cancelado: 0,
  }
  let ingresosTerceros = 0
  let totalInterno = 0
  for (const s of servicios) {
    porEstado[s.estado] = (porEstado[s.estado] ?? 0) + 1
    if (s.estado !== 'cancelado') {
      if (s.aTerceros) ingresosTerceros += importeServicio(s)
      else totalInterno += importeServicio(s)
    }
  }
  return {
    porEstado,
    activos: porEstado.planificado + porEstado.en_curso + porEstado.entregado,
    ingresosTerceros: round2(ingresosTerceros),
    totalInterno: round2(totalInterno),
  }
}
