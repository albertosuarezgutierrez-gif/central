import { redirect } from 'next/navigation'
import { getEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const empresa_id = await getEmpresaId()
  if (!empresa_id) redirect('/login')

  const today = new Date().toISOString().split('T')[0]

  const [empresa, sesiones, conexiones, clientes, limpiadoras] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre, email, plan FROM empresas WHERE id = ${empresa_id}::uuid
    `),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT cs.*, l.nombre AS limpiadora_nombre, c.nombre AS cliente_nombre
      FROM cleaning_sessions cs
      LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
      LEFT JOIN clientes    c ON c.id = cs.cliente_id
      WHERE cs.empresa_id = ${empresa_id}::uuid
        AND cs.session_date = ${today}::date
      ORDER BY cs.hora_inicio ASC NULLS LAST, l.nombre ASC
    `),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, cliente_nombre, pms_tipo, activa, ultimo_sync, sync_error
      FROM pms_connections
      WHERE empresa_id = ${empresa_id}::uuid
      ORDER BY cliente_nombre
    `),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, tipo FROM clientes
      WHERE empresa_id = ${empresa_id}::uuid AND activo = true
      ORDER BY nombre
    `),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre FROM limpiadoras
      WHERE empresa_id = ${empresa_id}::uuid AND activa = true
      ORDER BY nombre
    `)
  ])

  return (
    <DashboardClient
      empresa={empresa[0] || {}}
      sesionesIniciales={sesiones}
      conexiones={conexiones}
      clientes={clientes}
      limpiadoras={limpiadoras}
      today={today}
    />
  )
}
