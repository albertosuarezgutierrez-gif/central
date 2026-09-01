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
        {/* Esta app es la TRASTIENDA: la pantalla de trabajo es plataforma →
            Correduría. Aquí solo vive lo que no puede vivir allí (retarificar,
            que gasta 0,50€, y subir una póliza). No se añaden pantallas de
            consulta: se duplicarían las de plataforma. */}
        <span className="brand">Grupo Asegura · trastienda</span>
        <Link href="/dashboard">Resumen</Link>
        <Link href="/cartera">Cartera</Link>
        <span className="muted" style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.85)' }}>
          {session.nombre}
        </span>
        <LogoutButton />
      </nav>
      <div className="container">{children}</div>
    </>
  )
}
