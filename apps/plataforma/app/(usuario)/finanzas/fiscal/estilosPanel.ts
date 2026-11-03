// Estilos compartidos del panel fiscal. Solo tokens (`var(--…)`), nunca hex.
import type { CSSProperties } from 'react'
import { eur } from '@/lib/dinero'

export const tarjeta: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16, minWidth: 0 }
export const tituloBloque: CSSProperties = { fontSize: 14, fontWeight: 700, margin: 0 }
export const subBloque: CSSProperties = { fontSize: 12, color: 'var(--muted)', marginTop: 2 }
export const rejilla = (min = 280): CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 16 })
export const unaColumna: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }
/** Oculto a la vista, accesible al lector de pantalla. */
export const soloLector: CSSProperties = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }
export const th: CSSProperties = { textAlign: 'right', padding: '6px 8px', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }
export const td: CSSProperties = { textAlign: 'right', padding: '6px 8px', fontSize: 12, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

/** Importe o «sin dato» (nunca 0,00€ para null). `estimado` añade «~». */
export const dinero = (n: number | null | undefined, estimado = false): string => (n == null ? 'sin dato' : `${estimado ? '~' : ''}${eur(n)}`)
export const pct = (t: number): string => `${(t * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
export const fechaEs = (iso: string): string => iso.split('-').reverse().join('/')
