import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import InventariosClient, { type InventarioRow } from './inventarios-client'

export const dynamic = 'force-dynamic'

export default async function InventariosPage() {
  const s = await getSession()
  if (!s) redirect('/login')
  if (s.tipo !== 'oficina') redirect('/mi')

  const [inventarios, espacios, empleados] = await Promise.all([
    prisma.$queryRaw<InventarioRow[]>(Prisma.sql`
      SELECT i.id, e.nombre AS "espacioNombre", emp.nombre AS "empleadoNombre",
             i.estado, i.ciego, i.created_at AS "createdAt"
      FROM almacen_inventarios i
      JOIN almacen_espacios e ON e.id = i.espacio_id
      LEFT JOIN almacen_empleados emp ON emp.id = i.empleado_id
      WHERE i.cuenta_id = ${s.id}::uuid
      ORDER BY i.created_at DESC LIMIT 200
    `),
    prisma.almacenEspacio.findMany({ where: { cuentaId: s.id, activo: true }, orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }], select: { id: true, nombre: true } }),
    prisma.almacenEmpleado.findMany({ where: { cuentaId: s.id, activo: true }, orderBy: [{ nombre: 'asc' }], select: { id: true, nombre: true } }),
  ])

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Inventarios</h1>
          <div className="sub">Conteo físico por almacén — al cerrar, ajusta el stock</div>
        </div>
      </div>
      <InventariosClient inventarios={inventarios} espacios={espacios} empleados={empleados} />
    </main>
  )
}
