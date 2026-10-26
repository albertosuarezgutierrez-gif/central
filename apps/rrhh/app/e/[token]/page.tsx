import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getBranding } from '@/lib/empresa'
import LoginEmpleado from './LoginEmpleado'

// Look up empresa_id via the acceso_token (public — no auth needed yet). Marca Grupo ASegura siempre; solo el logo
// de la empresa cambia. Metadatos y manifest: los del layout raíz.
const empresaDeToken = cache(async (token: string) => {
  const rows = await prisma.$queryRaw<{ empresa_id: string }[]>(
    Prisma.sql`SELECT empresa_id FROM rrhh.empleados WHERE acceso_token = ${token} LIMIT 1`
  )
  return rows[0]?.empresa_id ?? null
})

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const empresaId = await empresaDeToken(token)
  const branding = empresaId ? await getBranding(empresaId) : null
  return <LoginEmpleado token={token} branding={branding} />
}
