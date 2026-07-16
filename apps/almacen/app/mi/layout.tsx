import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Brand } from '@/app/brand'
import LogoutButton from '@/app/(usuario)/logout-button'

export default async function MiLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession()
  if (!s) redirect('/login')
  return (
    <>
      <nav className="nav">
        <Brand />
        <span className="nav-spacer" />
        <span className="nav-account">
          <span className="dot" />
          {s.nombre}
        </span>
        <LogoutButton />
      </nav>
      <div className="container" style={{ maxWidth: 720 }}>{children}</div>
    </>
  )
}
