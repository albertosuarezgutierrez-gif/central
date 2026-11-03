import type { CSSProperties } from 'react'

export const NOTA: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
export const ERROR: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--negative)' }
export const COLUMNA: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }
export const CAMPO: CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 14,
}
