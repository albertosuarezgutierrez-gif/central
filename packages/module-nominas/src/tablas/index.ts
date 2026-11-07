import { TablaNoDisponibleError } from '../cifras'
import { TABLA_2025 } from './2025'
import { TABLA_2026 } from './2026'
import type { TablaAnual } from './tipo'
import { TABLA_IRPF_2026 } from './irpf-2026'
import type { TablaIrpf } from './irpf-tipo'

export * from './tipo'
export * from './irpf-tipo'
export { TABLA_2025, TABLA_2026, TABLA_IRPF_2026 }

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

const IRPF_POR_AÑO: Record<number, TablaIrpf> = { 2026: TABLA_IRPF_2026 }

export function añosConTablaIrpf(): number[] {
  return Object.keys(IRPF_POR_AÑO).map(Number).sort()
}

/** Tabla IRPF del año. Sin tabla → error (NUNCA la de otro año en silencio; 2025 no se vendoriza: no hay fuente). */
export function tablaIrpfDelAño(año: number): TablaIrpf {
  const t = IRPF_POR_AÑO[año]
  if (!t) throw new TablaNoDisponibleError(año)
  return t
}
