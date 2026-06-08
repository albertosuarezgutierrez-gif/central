import { serialize } from '@/lib/serialize'
import { redirect } from 'next/navigation'
import { getEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import RRHHClient from './RRHHClient'

export default async function RRHHPage() {
  const empresa_id = await getEmpresaId()
  if (!empresa_id) redirect('/login')

  const [limpiadoras, quejas_pendientes] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM rendimiento_limpiadoras
      WHERE empresa_id = ${empresa_id}::uuid
      ORDER BY quejas_pendientes DESC, total_sesiones DESC
    `),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT q.*, l.nombre AS limpiadora_nombre, p.nombre AS propiedad_nombre, cs.session_date
      FROM quejas q
      LEFT JOIN limpiadoras l ON l.id = q.limpiadora_id
      LEFT JOIN propiedades p ON p.id = q.propiedad_id
      LEFT JOIN cleaning_sessions cs ON cs.id = q.sesion_id
      WHERE q.empresa_id = ${empresa_id}::uuid
      ORDER BY q.creada_at DESC LIMIT 50
    `)
  ])

  return <RRHHClient limpiadoras={serialize(limpiadoras)} quejas={serialize(quejas_pendientes)} />
}
