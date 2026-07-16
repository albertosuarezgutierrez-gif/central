import Link from 'next/link'

// Conmutador 💶 Dinero | 🏢 Negocios por NAVEGACIÓN (Next Link, prefetch). Cada pestaña es una carga
// server-side independiente → /banca (Dinero) NO computa el holding y viceversa (carga perezosa real,
// sin el doble coste del render-both). El estado activo se pinta desde el prop `active` (server component).
export default function SegTabs({ active }: { active: 'dinero' | 'negocios' }) {
  const tab = (k: 'dinero' | 'negocios', label: string, href: string) => (
    <Link href={href} role="tab" aria-selected={active === k} prefetch style={{
      flex: 1, textAlign: 'center', textDecoration: 'none', fontSize: 14, fontWeight: 700,
      borderRadius: 9, padding: '9px 8px',
      background: active === k ? 'var(--surface)' : 'transparent',
      color: active === k ? 'var(--text)' : 'var(--muted)',
      boxShadow: active === k ? 'var(--shadow)' : 'none',
    }}>{label}</Link>
  )
  return (
    <div role="tablist" aria-label="Dinero o Negocios" style={{
      display: 'flex', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 4, maxWidth: 360,
    }}>
      {tab('dinero', '💶 Dinero', '/banca')}
      {tab('negocios', '🏢 Negocios', '/banca?tab=negocios')}
    </div>
  )
}
