import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verificarSesion, type Sesion } from '@/lib/auth'

// Error de autenticación: las rutas lo mapean a 401 para que el front distinga de un 500 real.
export class AuthError extends Error {
  status = 401
  constructor(m = 'No autenticado') { super(m); this.name = 'AuthError' }
}

// Lee la sesión del responsable desde la cookie. Sesión única por jti (fail-open ante BD).
export async function getSesion(): Promise<Sesion> {
  const token = (await cookies()).get('rrhh_session')?.value
  if (!token) throw new AuthError()
  let s: Sesion
  try { s = await verificarSesion(token) } catch { throw new AuthError('Sesión inválida') }
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT session_jti FROM rrhh.usuarios_rrhh WHERE id = ${s.usuario_id}::uuid LIMIT 1`)
    const dbJti = rows[0]?.session_jti
    if (dbJti && dbJti !== s.jti) throw new AuthError('Sesión cerrada en otro dispositivo')
  } catch (e) { if (e instanceof AuthError) throw e }
  return s
}
