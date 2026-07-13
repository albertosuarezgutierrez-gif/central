import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getBranding } from '@/lib/empresa'
import EmpleadosClient from './EmpleadosClient'

export default async function Page() {
  let empresa_id: string, usuario_id: string
  try { ({ empresa_id, usuario_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const [empleados, usuarioRows, branding] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, apellidos, dni, nss, email, puesto, estado, acceso_token, fecha_reconocimiento_medico
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
