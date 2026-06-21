// Cabecera compartida del panel superadmin de IALIMP (inicio + mailing).
// Logo REAL de marca (badge "ia" indigo + wordmark "ialimp" a dos tonos) y
// navegación clara entre las áreas. Paleta IALIMP fija (interno, no white-label).
import { C } from '@/app/superadmin/_ui'

// Marca IALIMP: cuadrado redondeado indigo con "ia" (como app/icon.svg) +
// wordmark "ialimp" ("ia" indigo + "limp" oscuro) y subtítulo opcional.
export function BrandMark({ size = 20, sub }: { size?: number; sub?: string }) {
  const badge = Math.round(size * 1.5)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.5) }}>
      <span style={{
        width: badge, height: badge, borderRadius: Math.round(badge * 0.28), background: C.accent,
        color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: Math.round(size * 0.92), letterSpacing: '-0.04em', lineHeight: 1, flexShrink: 0,
      }}>ia</span>
      <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ fontWeight: 900, fontSize: size, letterSpacing: '-0.03em', lineHeight: 1 }}>
          <span style={{ color: C.accent }}>ia</span><span style={{ color: C.text }}>limp</span>
        </span>
        {sub && <span style={{ fontSize: Math.max(10, Math.round(size * 0.5)), color: C.muted, fontWeight: 600, marginTop: 3, letterSpacing: '0.03em' }}>{sub}</span>}
      </span>
    </span>
  )
}

export default function SuperHeader({ activo }: { activo: 'inicio' | 'mailing' }) {
  const tab = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 9, fontWeight: 800, fontSize: 13, textDecoration: 'none',
    background: active ? C.accent : C.light, color: active ? '#fff' : C.accent,
    whiteSpace: 'nowrap', display: 'inline-block',
  })
  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <header style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <a href="/superadmin" style={{ textDecoration: 'none', flexShrink: 0 }}><BrandMark size={20} sub="Superadmin" /></a>
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href="/superadmin" style={tab(activo === 'inicio')}>🏠 Inicio</a>
        <a href="/superadmin/mailing" style={tab(activo === 'mailing')}>📣 Captación</a>
      </nav>
      <div style={{ flex: 1, minWidth: 8 }} />
      <div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>Alberto Suárez · {fecha}</div>
    </header>
  )
}
