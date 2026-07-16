import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import EmpleadosClient, { type EmpleadoRow } from './empleados-client'

export const dynamic = 'force-dynamic'

export default async function EmpleadosPage() {
  const s = await getSession()
  if (!s) redirect('/login')
  if (s.tipo !== 'oficina') redirect('/mi')
  const empleados: EmpleadoRow[] = await prisma.almacenEmpleado.findMany({
    where: { cuentaId: s.id, activo: true },
    orderBy: [{ nombre: 'asc' }],
    select: { id: true, nombre: true, usuario: true, telefono: true },
  })
  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Empleados</h1>
          <div className="sub">Altas de acceso — la oficina crea usuarios y contraseñas</div>
        </div>
        <span className="count-pill">{empleados.length}</span>
      </div>
      <EmpleadosClient empleados={empleados} />
    </main>
  )
}
