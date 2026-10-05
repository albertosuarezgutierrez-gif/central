import { NextResponse, type NextRequest } from 'next/server'
import { exigirAccesoCartera } from '@/lib/session'
import { credencialesGoogle, guardarConexion, secretoEstadoGoogle } from '@/lib/google-contactos'
import { COOKIE_NONCE_GOOGLE, verificarEstado } from '@/lib/google-oauth-estado'
import { canjearCodigo } from '@/lib/google-people'
import { urlVueltaPlataforma } from '@/lib/google-oauth-ticket'
import { URL_PLATAFORMA_DEFECTO } from '@/lib/datos-cotizados'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pagina(titulo: string, texto: string, status: number): NextResponse {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Google Contacts · Grupo ASegura</title><body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 16px">` +
    `<h1 style="font-size:1.3rem">${esc(titulo)}</h1><p>${esc(texto)}</p></body>`
  const res = new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  res.cookies.set(COOKIE_NONCE_GOOGLE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google-contactos', maxAge: 0 })
  return res
}

/** Vuelta a la vista de Google Contactos de plataforma; sin base válida, la página de siempre. */
function volver(resultado: 'ok' | 'error', motivo: string | null, titulo: string, texto: string, status: number): NextResponse {
  const url = urlVueltaPlataforma(process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO, resultado, motivo)
  if (!url) return pagina(titulo, texto, status)
  const res = NextResponse.redirect(url, 303)
  res.cookies.set(COOKIE_NONCE_GOOGLE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google-contactos', maxAge: 0 })
  return res
}

/**
 * GET /api/google-contactos/callback — vuelta del consentimiento de Google (05/10/2026).
 * `state` firmado + cookie del nonce de ESTE navegador; si además hay sesión de asegura, misma cuenta
 * y correduría (el flujo con ticket desde plataforma llega SIN sesión de asegura: ahí mandan el
 * `state` y el nonce). Solo entonces se canjea el código y se guarda el refresh token CIFRADO.
 * Al terminar (bien o mal) vuelve a plataforma `/correduria/google-contactos?google=ok|error&motivo=…`
 * (base FIJA del servidor, sin open redirect). Nada del token sale en la respuesta.
 */
export async function GET(req: NextRequest) {
  const acceso = await exigirAccesoCartera()
  if (!acceso.ok && acceso.motivo !== 'sin-sesion') return volver('error', 'sesion', 'No se conectó', 'Tu sesión de asegura no tiene acceso a la cartera.', 403)
  const sesion = acceso.ok ? { cuentaId: acceso.session.id, correduriaId: acceso.correduriaId } : null
  const q = req.nextUrl.searchParams
  const errorGoogle = q.get('error')
  if (errorGoogle) {
    return volver('error', errorGoogle === 'access_denied' ? 'cancelado' : 'google', 'No se conectó', `Google respondió «${errorGoogle}». No se ha guardado nada.`, 400)
  }

  let secreto: string
  try {
    secreto = secretoEstadoGoogle()
  } catch {
    return volver('error', 'sin_configurar', 'Sin configurar', 'Faltan las variables GOOGLE_CONTACTOS_* en este despliegue.', 503)
  }
  const v = verificarEstado(q.get('state'), { secreto, nonceCookie: req.cookies.get(COOKIE_NONCE_GOOGLE)?.value, sesion })
  if (!v.ok) return volver('error', `state_${v.motivo}`, 'Enlace no válido', `La vuelta de Google no se ha podido verificar (${v.motivo}). Empieza de nuevo desde «Conectar».`, 400)
  const code = q.get('code')
  if (!code) return volver('error', 'sin_codigo', 'Enlace no válido', 'Google no devolvió el código de autorización.', 400)

  try {
    const tokens = await canjearCodigo(credencialesGoogle(), code)
    const conectadoPor = acceso.ok ? (acceso.session.email ?? acceso.session.id) : v.datos.cuentaId
    await guardarConexion(v.datos.correduriaId, tokens, conectadoPor)
    return volver('ok', null, 'Google Contacts conectado', `Cuenta ${tokens.cuentaGoogle ?? '(sin email)'}. Puedes cerrar esta pestaña.`, 200)
  } catch (e) {
    const m = e instanceof Error ? e.message : 'error desconocido'
    console.error('[google-contactos/callback] no se pudo conectar:', m.slice(0, 200))
    return volver('error', 'canje', 'No se conectó', `${m.slice(0, 200)}. No se ha guardado nada.`, 502)
  }
}
