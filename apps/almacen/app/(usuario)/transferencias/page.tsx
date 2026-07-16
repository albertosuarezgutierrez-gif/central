import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import TransferenciasClient, { type TransferRow } from './transferencias-client'

export const dynamic = 'force-dynamic'

export default async function TransferenciasPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  const [transferencias, espacios, materiales] = await Promise.all([
    prisma.$queryRaw<TransferRow[]>(Prisma.sql`
      SELECT t.id, m.nombre AS "materialNombre", o.nombre AS origen, d.nombre AS destino,
             t.cantidad, t.estado, t.created_at AS "createdAt"
      FROM almacen_transferencias t
      JOIN almacen_materiales m ON m.id = t.material_id
      JOIN almacen_espacios o ON o.id = t.espacio_origen_id
      JOIN almacen_espacios d ON d.id = t.espacio_destino_id
      WHERE t.cuenta_id = ${s.id}::uuid
      ORDER BY t.created_at DESC LIMIT 300
    `),
    prisma.almacenEspacio.findMany({
      where: { cuentaId: s.id, activo: true }, orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      select: { id: true, nombre: true },
    }),
    prisma.almacenMaterial.findMany({
      where: { cuentaId: s.id, activo: true }, orderBy: [{ nombre: 'asc' }],
      select: { id: true, nombre: true },
    }),
  ])

  const pendientes = transferencias.filter((t) => t.estado === 'pendiente' || t.estado === 'parcial').length

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Transferencias</h1>
          <div className="sub">Traspasos entre almacenes — con confirmación de recepción</div>
        </div>
        {pendientes > 0 && <span className="count-pill">{pendientes} pendiente{pendientes === 1 ? '' : 's'}</span>}
      </div>
      <TransferenciasClient transferencias={transferencias} espacios={espacios} materiales={materiales} />
    </main>
  )
}
