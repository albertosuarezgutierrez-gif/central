import { TablaNoDisponibleError } from '../cifras'
import { TABLA_2025 } from './2025'
import { TABLA_2026 } from './2026'
import type { TablaAnual } from './tipo'

export * from './tipo'
export { TABLA_2025, TABLA_2026 }

const POR_AÑO: Record<number, TablaAnual> = { 2025: TABLA_2025, 2026: TABLA_2026 }

/** Tabla del año del periodo. Sin tabla → error (NUNCA la de otro año en silencio). */
export function tablaDelAño(año: number): TablaAnual {
  const t = POR_AÑO[año]
  if (!t) throw new TablaNoDisponibleError(año)
  return t
}

export function añosConTabla(): number[] {
  return Object.keys(POR_AÑO).map(Number).sort()
}
