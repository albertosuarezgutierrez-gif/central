import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSession } from '@/lib/session'
import { getAdmin } from '@/lib/superadmin'
import UserSidebar from './UserSidebar'
import CommandPalette from './CommandPalette'
import LayoutShell from './LayoutShell'
import { resolverAccesoCorreduria } from '@/lib/correduria-acceso'

export default async function UsuarioLayout({ children }: { children: React.ReactNode }) {
  const [session, admin] = await Promise.all([getSession(), getAdmin()])
  if (!session) redirect('/login')

  // Cuenta acotada a una sección (rol='empresas'): solo puede ver /empresas. El pathname lo
  // inyecta el middleware en la cabecera 'x-pathname'. Defensa en profundidad (además del nav filtrado).
  if (session.rol === 'empresas') {
    const path = (await headers()).get('x-pathname') || ''
    if (!path.startsWith('/empresas')) redirect('/empresas')
  }

  const isOperator = !!admin

  // Botón de búsqueda de la correduría: solo con acceso COMPROBADO. `sin-comprobar` y cualquier fallo
  // = false (conservador; la API devuelve 403 de todos modos).
  const accesoCorreduria = await resolverAccesoCorreduria(session)
    .then((a) => a.estado === 'autorizado')
    .catch(() => false)

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      <UserSidebar email={session.email} nombre={session.nombre} isOperator={isOperator} operadorRol={admin?.rol} rol={session.rol} accesoCorreduria={accesoCorreduria} />
      <LayoutShell>{children}</LayoutShell>
      <CommandPalette isOperator={isOperator} />
    </div>
  )
}
