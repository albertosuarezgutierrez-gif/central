'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { href: '/dashboard', icon: '🏠', label: 'Resumen' },
  { href: '/banca', icon: '🏦', label: 'Banca' },
  { href: '/comunicacion', icon: '💬', label: 'Comunicación' },
]

export default function UserSidebar({ email, nombre }: { email: string; nombre: string }) {
  const path = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <nav style={{
      width: 220, flexShrink: 0,
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
    }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '16px' }}>
          <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '13px' }}>ia</span>
          <span>plataforma</span>
        </div>
      </div>

      <div style={{ flex: 1, padding: '12px' }}>
        {NAV.map(({ href, icon, label }) => {
          const active = path === href || (href !== '/dashboard' && path.startsWith(href))
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px', marginBottom: '2px',
              fontWeight: active ? 700 : 400,
              background: active ? 'var(--primary-light)' : 'transparent',
              color: active ? 'var(--primary)' : 'var(--text)',
              fontSize: '14px',
            }}>
              <span>{icon}</span>
              <span>{label}</span>
            </Link>
          )
        })}
      </div>

      <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, marginBottom: '2px' }}>{nombre}</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        <button onClick={logout} style={{
          width: '100%', padding: '7px', fontSize: '13px',
          border: '1px solid var(--border)', borderRadius: '6px',
          color: 'var(--muted)', background: 'transparent',
        }}>Salir</button>
      </div>
    </nav>
  )
}
