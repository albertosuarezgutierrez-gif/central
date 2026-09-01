// Piezas compartidas de la página de rendimiento de pisos (cliente).
import type { CSSProperties } from 'react'

/** Paleta categórica por piso — validada con el validador de dataviz (light, 4 slots:
 *  banda de luminosidad, croma, separación CVD y suelo de visión normal en verde; el aviso de
 *  contraste se cubre con leyenda + tooltips + la tabla de abajo como vista alternativa). */
export const PISO_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#a16207']

export function colorPiso(idx: number): string {
  return PISO_COLORS[idx % PISO_COLORS.length]
}

export const card: CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '14px 16px',
}

export function colorMargen(m: number): string {
  if (m >= 40) return 'var(--success, #16a34a)'
  if (m >= 20) return 'var(--warning, #ca8a04)'
  return 'var(--danger, #dc2626)'
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** '2026-07' → 'jul 26' (para ejes de gráficas y celdas del heatmap). */
export function etiquetaMes(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MES_CORTO[Number(m) - 1] ?? m} ${y.slice(2)}`
}

/** '2026-07' → 'julio de 2026' (para titulares). */
export function nombreMesLargo(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}
