import { NextResponse, type NextRequest } from 'next/server'
import { exigirAccesoCartera } from '@/lib/session'
import { consumirTicketGoogle, credencialesGoogle, secretoEstadoGoogle } from '@/lib/google-contactos'
import { COOKIE_NONCE_GOOGLE, VIGENCIA_ESTADO_MS, firmarEstado, nuevoNonce } from '@/lib/google-oauth-estado'
import { canjearTicket, identidadInicio, urlVueltaPlataforma } from '@/lib/google-oauth-ticket'
import { URL_PLATAFORMA_DEFECTO } from '@/lib/datos-cotizados'
import { urlAutorizacion } from '@/lib/google-people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/google-contactos/conectar — arranca el OAuth de Google Contacts (05/10/2026).
 *
 * Dos puertas, fail-closed:
 *   · `?ticket=…` — viene del botón «Conectar Google» de plataforma (`/correduria/google-contactos`):
 *     ticket HMAC de 2 min y UN SOLO USO que emitió `POST /api/operador/google-contactos/ticket`.
 *     Un ticket malo NO cae a la sesión. Si falla, se vuelve a plataforma con el motivo.
 *   · sin ticket — sesión de asegura + ÁMBITO de correduría, como siempre.
 * Después, igual para las dos: `state` firmado y atado a una cookie httpOnly de este navegador.
 */
export async function GET(req: NextRequest) {
  const ticket = req.nextUrl.searchParams.get('ticket')
  let secreto: string | null = null
  try {
    secreto = secretoEstadoGoogle()
  } catch {
    secreto = null
  }
  const id = await identidadInicio({
    ticket,
    canjear: (t) => canjearTicket(t, { secreto: secreto ?? '', consumir: consumirTicketGoogle }),
    sesion: async () => {
      const a = await exigirAccesoCartera()
      return a.ok ? { ok: true, correduriaId: a.correduriaId, cuentaId: a.session.id } : { ok: false, status: a.status }
    },
  })
  if (!id.ok) {
    if (ticket !== null) {
      const vuelta = urlVueltaPlataforma(process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO, 'error', secreto ? id.motivo : 'sin_configurar')
      if (vuelta) return NextResponse.redirect(vuelta, 303)
    }
    return NextResponse.json({ error: 'No autorizado', motivo: id.motivo }, { status: id.status })
  }
  let destino: string
  const nonce = nuevoNonce()
  try {
    const state = firmarEstado({ correduriaId: id.correduriaId, cuentaId: id.cuentaId, nonce }, secretoEstadoGoogle())
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
