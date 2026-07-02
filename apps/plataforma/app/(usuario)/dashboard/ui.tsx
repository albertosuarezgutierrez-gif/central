// Primitivas visuales "Tremor-look" del dashboard (02/07/2026). Server-safe (sin hooks):
// las usan tanto Server Components como los client charts. Solo presentación — cero lógica.
import type { CSSProperties, ReactNode } from 'react'

export const EMERALD = '#059669'
export const ROSE = '#dc2626'
export const BLUE = '#2563eb'

// Tarjeta base: la misma en todos los widgets para que la página lea como un sistema.
export const cardStyle: CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow)',
}

// Cabecera de tarjeta: título discreto a la izquierda, acción/enlace a la derecha.
export function CardHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

// Métrica grande (el "Metric" de Tremor): número tabular protagonista + etiqueta muted.
export function Stat({ label, value, color, delta, bueno, sub }: {
  label: ReactNode
  value: ReactNode
  color?: string
  delta?: number | null
  bueno?: boolean
  sub?: ReactNode
}) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {delta !== undefined && <DeltaBadge pct={delta} bueno={bueno} />}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// Pastilla de variación ▲/▼. `bueno` colorea por significado (subir gastos = rojo), no por signo.
export function DeltaBadge({ pct, bueno }: { pct: number | null | undefined; bueno?: boolean }) {
  if (pct == null) return null
  const sube = pct >= 0
  const positivo = bueno ?? sube
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
      background: positivo ? '#ecfdf5' : '#fef2f2', color: positivo ? EMERALD : ROSE,
    }}>
      {sube ? '▲' : '▼'} {Math.abs(pct).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%
    </span>
  )
}

// Barra fina de progreso (las "ProgressBar" de Tremor): pista clara + relleno redondeado.
export function ThinBar({ pct, color, width }: { pct: number; color?: string; width?: number | string }) {
  return (
    <div style={{ background: 'var(--primary-light)', borderRadius: 999, height: 6, width: width ?? '100%', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ height: '100%', borderRadius: 999, background: color || 'var(--primary)', width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

// Fila de "BarList" (firma visual de Tremor): barra tintada de fondo con la etiqueta encima
// y el valor fuera, a la derecha.
export function BarListRow({ label, value, pct, share }: {
  label: ReactNode
  value: ReactNode
  pct: number
  share?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, position: 'relative', height: 32, minWidth: 0 }}>
        <div style={{
          position: 'absolute', inset: 0, width: `${Math.min(100, Math.max(2, pct))}%`,
          background: 'var(--primary-light)', borderRadius: 6,
        }} />
        <div style={{
          position: 'relative', height: '100%', display: 'flex', alignItems: 'center',
          padding: '0 10px', fontSize: 13, fontWeight: 500, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 92 }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {share && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{share}</span>}
      </div>
    </div>
  )
}

// Punto de leyenda.
export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}
