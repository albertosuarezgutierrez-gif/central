import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import LogoutButton from './logout-button'

export default async function UsuarioLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <>
      <nav className="nav">
        <strong>🚚 Transporte</strong>
        <Link href="/dashboard">Resumen</Link>
        <Link href="/flota">Flota</Link>
        <Link href="/servicios">Servicios</Link>
        <Link href="/mapa">🗺️ Mapa</Link>
        <span className="muted" style={{ marginLeft: 'auto' }}>{session.nombre}</span>
        <LogoutButton />
      </nav>
      <div className="container">{children}</div>
    </>
  )
}
