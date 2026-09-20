import { NextResponse } from 'next/server'
import { COOKIE_NAME, COOKIE_OPTS } from '@/lib/auth'

/**
 * Cierra la sesión borrando la cookie.
 *
 * 🚨 **Y eso es TODO lo que puede hacer hoy, que no es lo mismo que revocar.**
 * La sesión de esta app es stateless (JWT firmado, sin `jti` en base), así que
 * un token ya copiado sigue valiendo aunque aquí se pulse «salir»: lo único que
 * lo mata es su caducidad, hoy 12 h (`lib/auth.ts`).
 *
 * No es un olvido: `prisma_seguros` solo tiene **SELECT** sobre `public.cuentas`
 * (medido el 20/09/2026), así que esta app no puede escribir `session_jtis`.
 * Con `GRANT UPDATE (session_jtis) ON public.cuentas TO prisma_seguros` esto
 * pasaría a hacer un `array_remove` de SU jti —nunca vaciar la lista, que se
 * llevaría por delante las sesiones de plataforma, que comparten columna— y
 * entonces sí sería una revocación de verdad. Ver `lib/session.ts`.
 *
 * El borrado repite los MISMOS atributos con los que se puso la cookie (salvo
 * `maxAge`): si `secure`/`sameSite`/`path` no coinciden, el navegador puede
 * dejar la original en su sitio y el «salir» sería decorativo.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { ...COOKIE_OPTS, maxAge: 0 })
  return res
}
