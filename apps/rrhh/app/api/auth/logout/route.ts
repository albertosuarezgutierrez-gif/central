import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verificarSesion } from '@/lib/auth'
import { repoSesionResponsable } from '@/lib/tenant'
import { revocarSesionResponsable } from '@/lib/sesion-responsable-vigencia'

/**
 * «Salir» del responsable: además de borrar la cookie, invalida el token EN EL SERVIDOR rotando `session_jti` a un valor
 * aleatorio nuevo (solo si el token es el vigente), así una copia de la cookie deja de valer aunque le queden días.
 * Token ausente o no válido: solo se borra la cookie. Si la BD falla, se borra la cookie igualmente y se responde 500
 * para que no parezca que la revocación se ha hecho.
 */
export async function POST() {
  const token = (await cookies()).get('rrhh_session')?.value
  let revocada = true
  if (token) {
    const s = await verificarSesion(token).catch(() => null)
    if (s) {
      try { await revocarSesionResponsable(repoSesionResponsable, s) } catch (e) {
        revocada = false
        console.error('[logout] no se ha podido revocar la sesión en BD', e instanceof Error ? e.message : e)
      }
    }
  }
  const res = NextResponse.json(revocada ? { ok: true } : { ok: false, error: 'revocacion_fallida' }, { status: revocada ? 200 : 500 })
  res.cookies.set('rrhh_session', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
