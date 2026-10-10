import { cookies } from 'next/headers'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { COOKIE_EMPLEADO, sesionVigente, verificarSesionEmpleado, type SesionEmpleado } from '@/lib/empleado-auth'
import { AuthError } from '@/lib/tenant'

/**
 * Lee la sesión del EMPLEADO desde la cookie `rrhh_empleado`. Lanza AuthError si no hay o si ya
 * no vale (versión revocada por el responsable, empleado de baja o de otra empresa).
 *
 * 🚨 Fail-CLOSED ante la BD, al revés que el responsable: con sesiones de 90 días la revocación
 * es lo único que corta una cookie robada. Un error de BD se propaga (500), no se convierte en
 * «vale» ni en un cierre de sesión.
 */
export async function getSesionEmpleado(): Promise<SesionEmpleado> {
  const token = (await cookies()).get(COOKIE_EMPLEADO)?.value
  if (!token) throw new AuthError()
  let s: SesionEmpleado
  try { s = await verificarSesionEmpleado(token) } catch { throw new AuthError('Sesión inválida') }
  const rows = await prisma.$queryRaw<{ sesion_version: number; estado: string }[]>(Prisma.sql`
    SELECT sesion_version, estado FROM rrhh.empleados
    WHERE id = ${s.empleado_id}::uuid AND empresa_id = ${s.empresa_id}::uuid LIMIT 1`)
  if (!sesionVigente(s, rows[0] ?? null)) throw new AuthError('Sesión cerrada')
  return s
}
