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
        <strong>📦 Alquiler</strong>
        <Link href="/dashboard">Resumen</Link>
        <Link href="/materiales">Materiales</Link>
        <Link href="/alquileres">Alquileres</Link>
        <span className="muted" style={{ marginLeft: 'auto' }}>{session.nombre}</span>
        <LogoutButton />
      </nav>
      <div className="container">{children}</div>
    </>
  )
}
