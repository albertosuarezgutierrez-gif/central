import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSesion, AuthError } from '@/lib/tenant'
import Page from '@/components/ui/Page'
import MaterialAdminLista from '@/components/MaterialAdminLista'

export default async function MaterialPage() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  // Solo id + nombre para el filtro (nunca columnas secretas del empleado).
  const empleados = await prisma.$queryRaw<{ id: string; nombre: string }[]>(Prisma.sql`
    SELECT id::text AS id, TRIM(CONCAT_WS(', ', NULLIF(apellidos, ''), nombre)) AS nombre
    FROM rrhh.empleados WHERE empresa_id = ${empresa_id}::uuid
    ORDER BY COALESCE(apellidos, nombre) ASC, nombre ASC`)
  return (
    <Page titulo="Material de los empleados" subtitulo="Fotos de EPIs, herramientas y máquinas que suben los empleados desde su portal.">
      <MaterialAdminLista empleados={empleados} />
    </Page>
  )
}
