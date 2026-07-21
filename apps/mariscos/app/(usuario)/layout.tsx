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
        <span className="brand">
          {/* Logo corporativo Mariscos González (reutilizado de iarrhh). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/mariscos-gonzalez.png" alt="Mariscos González" />
        </span>
        <Link href="/dashboard">Resumen</Link>
        <Link href="/partidas">Partidas</Link>
        <Link href="/etiquetas">Etiquetas</Link>
        <span className="muted" style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.85)' }}>
          {session.nombre}
        </span>
        <LogoutButton />
      </nav>
      <div className="container">{children}</div>
    </>
  )
}
