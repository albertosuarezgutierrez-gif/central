import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getBranding } from '@/lib/empresa'
import LoginEmpleado from './LoginEmpleado'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // Look up empresa_id via the acceso_token (public — no auth needed yet)
  const rows = await prisma.$queryRaw<{ empresa_id: string }[]>(
    Prisma.sql`SELECT empresa_id FROM rrhh.empleados WHERE acceso_token = ${token} LIMIT 1`
  )
  const branding = rows[0] ? await getBranding(rows[0].empresa_id) : null
  return <LoginEmpleado token={token} branding={branding} />
}
