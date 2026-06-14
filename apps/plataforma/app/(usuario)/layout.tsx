import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import UserSidebar from './UserSidebar'

export default async function UsuarioLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <UserSidebar email={session.email} nombre={session.nombre} />
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
