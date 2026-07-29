import Link from 'next/link'

type Seg = 'dinero' | 'negocios' | 'fiscal' | 'personal'

// Conmutador 💶 Dinero | 🏢 Negocios | 🧾 Fiscal | 🏠 Personal por NAVEGACIÓN (Next Link, prefetch). Cada
// pestaña es una carga server-side independiente → /banca (Dinero) NO computa el holding ni la fiscalidad
// ni el desglose personal y viceversa (carga perezosa real, sin el doble coste del render-both). El estado
// activo se pinta desde el prop `active` (server component). Fiscal = la previsión de la declaración de la
// renta (Hoy / Fin de año). Personal = en qué se gasta el dinero del día a día, por categoría/comercio.
export default function SegTabs({ active }: { active: Seg }) {
  const tab = (k: Seg, label: string, href: string) => (
    <Link href={href} role="tab" aria-selected={active === k} prefetch style={{
      flex: 1, textAlign: 'center', textDecoration: 'none', fontSize: 14, fontWeight: 700,
      borderRadius: 9, padding: '9px 8px', whiteSpace: 'nowrap',
      background: active === k ? 'var(--surface)' : 'transparent',
      color: active === k ? 'var(--text)' : 'var(--muted)',
      boxShadow: active === k ? 'var(--shadow)' : 'none',
    }}>{label}</Link>
  )
  return (
    <div role="tablist" aria-label="Dinero, Negocios, Fiscal o Personal" style={{
      display: 'flex', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 4, maxWidth: 600, flexWrap: 'wrap',
    }}>
      {tab('dinero', '💶 Dinero', '/banca')}
      {tab('negocios', '🏢 Negocios', '/banca?tab=negocios')}
      {tab('fiscal', '🧾 Fiscal', '/banca?tab=fiscal')}
      {tab('personal', '🏠 Personal', '/banca?tab=personal')}
    </div>
  )
}
