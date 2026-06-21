import { redirect } from 'next/navigation'
import { getEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import PropiedadesClient from './PropiedadesClient'

export default async function PropiedadesPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const empresa_id = await getEmpresaId()
  if (!empresa_id) redirect('/login')

  const { id: cliente_id } = await params

  const [clientes, propiedades, conexiones] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, tipo FROM clientes
      WHERE id = ${cliente_id}::uuid AND empresa_id = ${empresa_id}::uuid
    `),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        p.*,
        COUNT(DISTINCT cs.id) FILTER (
          WHERE cs.session_date = CURRENT_DATE
        ) AS sesiones_hoy,
        COUNT(DISTINCT cs.id) FILTER (
          WHERE cs.completed_at IS NOT NULL
        ) AS total_completadas,
        MAX(cs.session_date) FILTER (
          WHERE cs.completed_at IS NOT NULL
        ) AS ultima_limpieza
      FROM propiedades p
      LEFT JOIN cleaning_sessions cs ON cs.propiedad_id = p.id
      WHERE p.cliente_id = ${cliente_id}::uuid
        AND p.empresa_id = ${empresa_id}::uuid
      GROUP BY p.id
      ORDER BY p.activa DESC, p.nombre ASC
    `),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, cliente_nombre, pms_tipo FROM pms_connections
      WHERE empresa_id = ${empresa_id}::uuid AND activa = true
      ORDER BY cliente_nombre
    `)
  ])

  if (!clientes.length) redirect('/admin/clientes')

  return (
    <PropiedadesClient
      cliente={clientes[0]}
      propiedadesIniciales={propiedades}
      conexiones={conexiones}
    />
  )
}
