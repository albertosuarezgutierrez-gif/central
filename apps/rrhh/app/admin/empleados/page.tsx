import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getBranding } from '@/lib/empresa'
import EmpleadosClient from './EmpleadosClient'
import { SQL_COLUMNAS_LISTADO_EMPLEADOS } from '@/lib/empleados-columnas'

export default async function Page() {
  let empresa_id: string, usuario_id: string
  try { ({ empresa_id, usuario_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const [empleados, usuarioRows, branding] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${Prisma.raw(SQL_COLUMNAS_LISTADO_EMPLEADOS)}
      FROM rrhh.empleados WHERE empresa_id = ${empresa_id}::uuid
      ORDER BY COALESCE(apellidos, nombre) ASC, nombre ASC`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT nombre FROM rrhh.usuarios_rrhh WHERE id = ${usuario_id}::uuid`),
    getBranding(empresa_id),
  ])
  return (
    <EmpleadosClient
      inicial={JSON.parse(JSON.stringify(empleados))}
      nombreUsuario={usuarioRows[0]?.nombre ?? ''}
      nombreEmpresa={branding.nombre}
      logoUrl={branding.logo_url}
      colorPrimario={branding.color_primario}
      tieneFichaje={branding.tiene_fichaje}
    />
  )
}
