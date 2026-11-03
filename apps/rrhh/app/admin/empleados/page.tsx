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
  const [empleados, usuarioRows, branding, pendientes] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${Prisma.raw(SQL_COLUMNAS_LISTADO_EMPLEADOS)}
      FROM rrhh.empleados WHERE empresa_id = ${empresa_id}::uuid
      ORDER BY COALESCE(apellidos, nombre) ASC, nombre ASC`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT nombre FROM rrhh.usuarios_rrhh WHERE id = ${usuario_id}::uuid`),
    getBranding(empresa_id),
    // Una sola consulta agregada, SIEMPRE con empresa_id de sesión. Si falla, las tarjetas salen sin chips
    // (`undefined` = «no se sabe»; nunca 0).
    prisma.$queryRaw<{ empleado_id: string; sin_firmar: number; solic_pend: number }[]>(Prisma.sql`
      SELECT e.id AS empleado_id,
        (SELECT count(*)::int FROM rrhh.documentos d WHERE d.empresa_id = e.empresa_id AND d.empleado_id = e.id AND d.estado_firma = 'pendiente') AS sin_firmar,
        (SELECT count(*)::int FROM rrhh.solicitudes s WHERE s.empresa_id = e.empresa_id AND s.empleado_id = e.id AND s.estado = 'solicitada') AS solic_pend
      FROM rrhh.empleados e WHERE e.empresa_id = ${empresa_id}::uuid`).catch(() => null),
  ])
  const porId = new Map((pendientes ?? []).map(p => [p.empleado_id, p]))
  const conPendientes = empleados.map(e => {
    const p = porId.get(e.id)
    return p ? { ...e, sin_firmar: p.sin_firmar, solic_pend: p.solic_pend } : e
  })
  return (
    <EmpleadosClient
      inicial={JSON.parse(JSON.stringify(conPendientes))}
      nombreUsuario={usuarioRows[0]?.nombre ?? ''}
      nombreEmpresa={branding.nombre}
    />
  )
}
