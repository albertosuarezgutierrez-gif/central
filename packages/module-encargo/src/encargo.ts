// Lógica del agregado Encargo: máquina de estados, composición y resumen.
// Funciones puras sobre los tipos genéricos (sin BD).
import type {
  ComponenteEncargo,
  Encargo,
  EstadoEncargo,
  ResumenEncargos,
} from './types'

export const ESTADOS: EstadoEncargo[] = [
  'borrador',
  'presupuestado',
  'confirmado',
  'en_curso',
  'completado',
  'cancelado',
]

export const ESTADOS_ABIERTOS: EstadoEncargo[] = [
  'borrador',
  'presupuestado',
  'confirmado',
  'en_curso',
]

export const ESTADOS_CERRADOS: EstadoEncargo[] = ['completado', 'cancelado']

// Máquina de estados: a qué estados se puede pasar desde cada uno. Se puede cancelar desde
// cualquier estado abierto; completar solo desde 'en_curso'; los cerrados son terminales.
export const TRANSICIONES: Record<EstadoEncargo, EstadoEncargo[]> = {
  borrador: ['presupuestado', 'confirmado', 'cancelado'],
  presupuestado: ['confirmado', 'cancelado'],
  confirmado: ['en_curso', 'cancelado'],
  en_curso: ['completado', 'cancelado'],
  completado: [],
  cancelado: [],
}

export function esAbierto(encargo: Encargo): boolean {
  return ESTADOS_ABIERTOS.includes(encargo.estado)
}

export function esCerrado(encargo: Encargo): boolean {
  return ESTADOS_CERRADOS.includes(encargo.estado)
}

/** ¿Es válida la transición de estado `de` → `a`? */
export function puedeTransicionar(de: EstadoEncargo, a: EstadoEncargo): boolean {
  return TRANSICIONES[de]?.includes(a) ?? false
}

/**
 * Devuelve una COPIA del encargo con el nuevo estado (y updatedAt si se pasa).
 * Lanza si la transición no es válida.
 */
export function transicionar(
  encargo: Encargo,
  a: EstadoEncargo,
  updatedAt?: string,
): Encargo {
  if (!puedeTransicionar(encargo.estado, a)) {
    throw new Error(`Transición inválida: ${encargo.estado} → ${a}`)
  }
  return { ...encargo, estado: a, updatedAt: updatedAt ?? encargo.updatedAt ?? null }
}

/** Componentes (módulos) realmente vinculados a un encargo, en orden estable. */
export function componentesVinculados(encargo: Encargo): ComponenteEncargo[] {
  const e = encargo.enlaces ?? {}
  const out: ComponenteEncargo[] = []
  if (e.oportunidadId) out.push('oportunidad')
  if (e.presupuestoId) out.push('presupuesto')
  if (e.recursoReservaId) out.push('reserva')
  if (e.asignacionesActivo && e.asignacionesActivo.length > 0) out.push('activos')
  if (e.proveedores && e.proveedores.length > 0) out.push('proveedores')
  if (e.porteIds && e.porteIds.length > 0) out.push('portes')
  if (e.portalId) out.push('portal')
  if (e.feedbackId) out.push('feedback')
  return out
}

/** ¿Están vinculados todos los componentes requeridos? */
export function estaCompleto(encargo: Encargo, requeridos: ComponenteEncargo[]): boolean {
  const tiene = new Set(componentesVinculados(encargo))
  return requeridos.every((c) => tiene.has(c))
}

/** Componentes requeridos que faltan por vincular. */
export function componentesFaltantes(
  encargo: Encargo,
  requeridos: ComponenteEncargo[],
): ComponenteEncargo[] {
  const tiene = new Set(componentesVinculados(encargo))
  return requeridos.filter((c) => !tiene.has(c))
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function mismoMes(iso: string | null | undefined, ref: Date): boolean {
  if (!iso) return false
  const d = new Date(iso)
  return d.getUTCFullYear() === ref.getUTCFullYear() && d.getUTCMonth() === ref.getUTCMonth()
}

/** Resumen agregado para un panel de encargos. */
export function resumenEncargos(encargos: Encargo[], ref: Date = new Date()): ResumenEncargos {
  const porEstado = ESTADOS.reduce(
    (acc, e) => {
      acc[e] = 0
      return acc
    },
    {} as Record<EstadoEncargo, number>,
  )
  const porTipo: Record<string, number> = {}
  let valorAbierto = 0

  for (const enc of encargos) {
    if (porEstado[enc.estado] != null) porEstado[enc.estado] += 1
    porTipo[enc.tipo] = (porTipo[enc.tipo] ?? 0) + 1
    if (esAbierto(enc)) valorAbierto += enc.importeTotal ?? 0
  }

  const abiertos = encargos.filter(esAbierto).length
  const completadosMes = encargos.filter(
    (e) => e.estado === 'completado' && mismoMes(e.updatedAt ?? e.createdAt, ref),
  ).length

  return { porEstado, porTipo, abiertos, completadosMes, valorAbierto: round2(valorAbierto) }
}
