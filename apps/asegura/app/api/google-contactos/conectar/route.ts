import { NextResponse } from 'next/server'
import { exigirAccesoCartera } from '@/lib/session'
import { credencialesGoogle, secretoEstadoGoogle } from '@/lib/google-contactos'
import { COOKIE_NONCE_GOOGLE, VIGENCIA_ESTADO_MS, firmarEstado, nuevoNonce } from '@/lib/google-oauth-estado'
import { urlAutorizacion } from '@/lib/google-people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/google-contactos/conectar — arranca el OAuth de Google Contacts (05/10/2026).
 *
 * Se abre en el NAVEGADOR de Alberto con su sesión de asegura (no es una ruta del puerto: el
 * consentimiento de Google necesita un humano). Sesión + ÁMBITO de correduría, fail-closed.
 * El `state` va firmado y atado a una cookie httpOnly de este navegador (anti-CSRF).
 */
export async function GET() {
  const acceso = await exigirAccesoCartera()
  if (!acceso.ok) return NextResponse.json(acceso.cuerpo, { status: acceso.status })
  let destino: string
  const nonce = nuevoNonce()
  try {
    const state = firmarEstado({ correduriaId: acceso.correduriaId, cuentaId: acceso.session.id, nonce }, secretoEstadoGoogle())
    destino = urlAutorizacion(credencialesGoogle(), state)
  } catch {
    return NextResponse.json({ error: 'Google Contacts sin configurar (faltan variables GOOGLE_CONTACTOS_*)' }, { status: 503 })
  }
  const res = NextResponse.redirect(destino)
  res.cookies.set(COOKIE_NONCE_GOOGLE, nonce, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google-contactos', maxAge: VIGENCIA_ESTADO_MS / 1000,
  })
  return res
}
