import { cookies } from 'next/headers'
import { verificarSesionEmpleado, type SesionEmpleado } from '@/lib/empleado-auth'
import { AuthError } from '@/lib/tenant'

/** Lee la sesión del EMPLEADO desde la cookie `rrhh_empleado`. Lanza AuthError si no hay. */
export async function getSesionEmpleado(): Promise<SesionEmpleado> {
  const token = (await cookies()).get('rrhh_empleado')?.value
  if (!token) throw new AuthError()
  try { return await verificarSesionEmpleado(token) } catch { throw new AuthError('Sesión inválida') }
}
