// Datos del responsable que necesita la cabecera: su correo (para el enlace «Seguros») y sus empresas (selector de Pilar).
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export type EmpresaLista = { id: string; nombre: string }

export async function datosCabeceraResponsable(usuarioId: string): Promise<{ email: string | null; empresas: EmpresaLista[] }> {
  const [u, empresas] = await Promise.all([
    prisma.$queryRaw<{ email: string | null }[]>(Prisma.sql`SELECT email FROM rrhh.usuarios_rrhh WHERE id = ${usuarioId}::uuid LIMIT 1`).catch(() => []),
    prisma.$queryRaw<EmpresaLista[]>(Prisma.sql`
      SELECT e.id::text AS id, e.nombre FROM rrhh.empresas e
      JOIN rrhh.usuario_empresas ue ON ue.empresa_id = e.id
      WHERE ue.usuario_id = ${usuarioId}::uuid ORDER BY e.nombre ASC`).catch(() => []),
  ])
  return { email: u[0]?.email ?? null, empresas }
}
