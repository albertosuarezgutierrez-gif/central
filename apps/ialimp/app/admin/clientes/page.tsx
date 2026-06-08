import { redirect } from 'next/navigation'
import { getEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import ClientesClient from './ClientesClient'

export default async function ClientesPage() {
  const empresa_id = await getEmpresaId()
  if (!empresa_id) redirect('/login')

  const clientes = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      c.*,
      COUNT(DISTINCT pc.id) AS pms_count,
      COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.session_date = CURRENT_DATE
      ) AS sesiones_hoy,
      COUNT(DISTINCT cs.id) FILTER (
        WHERE cs.session_date >= CURRENT_DATE
        AND cs.completed_at IS NULL
      ) AS sesiones_pendientes
    FROM clientes c
    LEFT JOIN pms_connections pc ON pc.cliente_id = c.id AND pc.activa = true
    LEFT JOIN cleaning_sessions cs ON cs.cliente_id = c.id
    WHERE c.empresa_id = ${empresa_id}::uuid
    GROUP BY c.id
    ORDER BY c.activo DESC, c.nombre ASC
  `)

  return <ClientesClient clientesIniciales={clientes} />
}
