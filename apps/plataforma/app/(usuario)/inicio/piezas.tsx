import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { cardStyle } from '@/components/ui'

// Piezas compartidas por las tarjetas del Inicio. Server-safe (sin handlers).

export function Tarjeta({ titulo, href, enlace, ancha, children }: {
  titulo: ReactNode
  href: string
  enlace: string
  ancha?: boolean
  children: ReactNode
}) {
  return (
    <section style={{ ...cardStyle, display: 'grid', gap: 14, minWidth: 0, gridColumn: ancha ? '1 / -1' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>{titulo}</h2>
        <Link href={href} style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          {enlace} →
        </Link>
      </div>
      {children}
    </section>
  )
}

/** Cifras de cabecera de una tarjeta: se apilan solas en móvil. */
export function Cifras({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 10 }}>
      {children}
    </div>
  )
}

export function Cifra({ label, valor, sub, color }: { label: ReactNode; valor: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--text)', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

/** Una fuente que no respondió: se DICE, nunca se pinta como cero. */
export function NoDisponible({ que, motivo, donde }: { que: string; motivo: string; donde?: ReactNode }) {
  return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--muted)' }}>
      <strong style={{ display: 'block', color: 'var(--text)', marginBottom: 2 }}>{que}: no disponible ahora</strong>
      {motivo}. Esto no significa que no haya nada{donde ? <> — mira en {donde}</> : null}.
    </div>
  )
}

export function Aviso({ tono, children }: { tono: 'aviso' | 'negativo'; children: ReactNode }) {
  const c = tono === 'negativo'
    ? { background: 'var(--negative-bg)', color: 'var(--negative)' }
    : { background: 'var(--warning-bg)', color: 'var(--warning)' }
  return <div style={{ ...c, borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{children}</div>
}

export const subTitulo: CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0,
}

export const fila: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center',
  padding: '9px 2px', borderTop: '1px solid var(--border)', minHeight: 44, color: 'var(--text)', textDecoration: 'none',
}

/** Esqueleto mientras carga una tarjeta: la página pinta YA y cada tarjeta llega cuando llega. */
export function Esqueleto({ titulo, ancha }: { titulo: string; ancha?: boolean }) {
  const barra = (w: string, h = 14): CSSProperties => ({ width: w, height: h, borderRadius: 6, background: 'var(--bg)' })
  return (
    <section aria-busy="true" style={{ ...cardStyle, display: 'grid', gap: 12, gridColumn: ancha ? '1 / -1' : undefined }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>{titulo}</h2>
      <div style={barra('60%')} />
      <div style={barra('100%', ancha ? 120 : 48)} />
      <div style={barra('80%')} />
    </section>
  )
}
