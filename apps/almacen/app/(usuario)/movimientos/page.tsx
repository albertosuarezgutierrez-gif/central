import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import MovimientosClient, { type MovRow } from './movimientos-client'

export const dynamic = 'force-dynamic'

export default async function MovimientosPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  const movimientos = await prisma.$queryRaw<MovRow[]>(Prisma.sql`
    SELECT mv.id, m.nombre AS "materialNombre", mv.tipo, mv.cantidad,
           o.nombre AS origen, d.nombre AS destino, mv.motivo,
           mv.realizado_por AS "realizadoPor", mv.fecha
    FROM almacen_movimientos mv
    JOIN almacen_materiales m ON m.id = mv.material_id
    LEFT JOIN almacen_espacios o ON o.id = mv.espacio_origen_id
    LEFT JOIN almacen_espacios d ON d.id = mv.espacio_destino_id
    WHERE mv.cuenta_id = ${s.id}::uuid
    ORDER BY mv.fecha DESC LIMIT 500
  `)

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Movimientos</h1>
          <div className="sub">Libro de movimientos del almacén — auditoría</div>
        </div>
      </div>
      <MovimientosClient movimientos={movimientos} />
    </main>
  )
}
