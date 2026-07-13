import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { getBranding } from '@/lib/empresa'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import ObrasClient from './ObrasClient'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const [obras, branding] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, nombre, direccion, lat, lng, radio_m, activa FROM rrhh.obras WHERE empresa_id = ${empresa_id}::uuid ORDER BY nombre ASC`),
    getBranding(empresa_id),
  ])
  return <ObrasClient inicial={JSON.parse(JSON.stringify(obras))} logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario} tieneFichaje={branding.tiene_fichaje} />
}
