import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verificarSesion, type Sesion } from '@/lib/auth'
import { motivoRechazoSesion, type RepoSesionResponsable } from '@/lib/sesion-responsable-vigencia'

// Error de autenticación: las rutas lo mapean a 401 para que el front distinga de un 500 real.
export class AuthError extends Error {
  status = 401
  constructor(m = 'No autenticado') { super(m); this.name = 'AuthError' }
}

/** Adaptador Prisma del puerto de vigencia (`lib/sesion-responsable-vigencia.ts`). */
export const repoSesionResponsable: RepoSesionResponsable = {
  async estadoSesion(usuario_id, empresa_id) {
    const rows = await prisma.$queryRaw<{ session_jti: string | null; empresa_autorizada: boolean }[]>(Prisma.sql`
      SELECT u.session_jti,
             EXISTS (SELECT 1 FROM rrhh.usuario_empresas ue
                     WHERE ue.usuario_id = u.id AND ue.empresa_id = ${empresa_id}::uuid) AS empresa_autorizada
      FROM rrhh.usuarios_rrhh u WHERE u.id = ${usuario_id}::uuid LIMIT 1`)
    return rows[0] ?? null
  },
  async rotarJti(usuario_id, actual, nuevo) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.usuarios_rrhh SET session_jti = ${nuevo} WHERE id = ${usuario_id}::uuid AND session_jti = ${actual}`)
  },
}

/**
 * Lee la sesión del responsable desde la cookie y la revalida EN BD en cada petición: jti vigente (sesión única,
 * «Salir» lo rota; NULL no vale) y empresa del token todavía en `usuario_empresas`.
 *
 * 🚨 Fail-CLOSED ante la BD (antes era fail-open): con sesiones de 90 días, la revocación y la retirada de empresa son
 * lo único que corta una cookie robada o un acceso que ya no toca, y esto es multi-tenant (`empresa_id` decide qué datos
 * se ven). Un error de BD se PROPAGA (no es AuthError → 500 en las rutas, sin cerrar la sesión): si la BD no responde,
 * el panel tampoco podría servir datos, así que cerrar no cuesta nada y abrir sí podría.
 */
export async function getSesion(): Promise<Sesion> {
  const token = (await cookies()).get('rrhh_session')?.value
  if (!token) throw new AuthError()
  let s: Sesion
  try { s = await verificarSesion(token) } catch { throw new AuthError('Sesión inválida') }
  const motivo = motivoRechazoSesion(s, await repoSesionResponsable.estadoSesion(s.usuario_id, s.empresa_id))
  if (motivo) throw new AuthError(motivo === 'empresa_retirada' ? 'Empresa no autorizada' : 'Sesión cerrada')
  return s
}
