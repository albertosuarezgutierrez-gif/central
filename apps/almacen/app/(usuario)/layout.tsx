import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Brand } from '@/app/brand'
import NavLinks from './nav-links'
import LogoutButton from './logout-button'

export default async function UsuarioLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.tipo === 'empleado') redirect('/mi')

  return (
    <>
      <nav className="nav">
        <Brand />
        <NavLinks />
        <span className="nav-spacer" />
        <span className="nav-account">
          <span className="dot" />
          {session.nombre}
        </span>
        <LogoutButton />
      </nav>
      <div className="container">{children}</div>
    </>
  )
}
