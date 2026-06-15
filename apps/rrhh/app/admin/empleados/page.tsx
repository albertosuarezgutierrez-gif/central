import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import EmpleadosClient from './EmpleadosClient'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const empleados = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, email, puesto, estado, acceso_token FROM empleados WHERE empresa_id = ${empresa_id}::uuid ORDER BY nombre ASC`)
  return <EmpleadosClient inicial={JSON.parse(JSON.stringify(empleados))} />
}
