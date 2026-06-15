import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getAdmin } from '@/lib/superadmin'
import UserSidebar from './UserSidebar'
import CommandPalette from './CommandPalette'
import LayoutShell from './LayoutShell'

export default async function UsuarioLayout({ children }: { children: React.ReactNode }) {
  const [session, admin] = await Promise.all([getSession(), getAdmin()])
  if (!session) redirect('/login')

  const isOperator = !!admin

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <UserSidebar email={session.email} nombre={session.nombre} isOperator={isOperator} />
      <LayoutShell>{children}</LayoutShell>
      <CommandPalette isOperator={isOperator} />
    </div>
  )
}
