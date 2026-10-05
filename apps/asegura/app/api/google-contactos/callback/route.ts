import { NextResponse, type NextRequest } from 'next/server'
import { exigirAccesoCartera } from '@/lib/session'
import { credencialesGoogle, guardarConexion, secretoEstadoGoogle } from '@/lib/google-contactos'
import { COOKIE_NONCE_GOOGLE, verificarEstado } from '@/lib/google-oauth-estado'
import { canjearCodigo } from '@/lib/google-people'

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

/**
 * GET /api/google-contactos/callback — vuelta del consentimiento de Google (05/10/2026).
 * Sesión + ámbito, `state` firmado + cookie del nonce + misma cuenta y correduría; solo entonces
 * se canjea el código y se guarda el refresh token CIFRADO. Nada del token sale en la respuesta.
 */
export async function GET(req: NextRequest) {
  const acceso = await exigirAccesoCartera()
  if (!acceso.ok) return NextResponse.json(acceso.cuerpo, { status: acceso.status })
  const q = req.nextUrl.searchParams
  if (q.get('error')) return pagina('No se conectó', `Google respondió «${q.get('error')}». No se ha guardado nada.`, 400)

  let secreto: string
  try {
    secreto = secretoEstadoGoogle()
  } catch {
    return pagina('Sin configurar', 'Faltan las variables GOOGLE_CONTACTOS_* en este despliegue.', 503)
  }
  const v = verificarEstado(q.get('state'), {
    secreto,
    nonceCookie: req.cookies.get(COOKIE_NONCE_GOOGLE)?.value,
    cuentaId: acceso.session.id,
    correduriaId: acceso.correduriaId,
  })
  if (!v.ok) return pagina('Enlace no válido', `La vuelta de Google no se ha podido verificar (${v.motivo}). Empieza de nuevo desde «Conectar».`, 400)
  const code = q.get('code')
  if (!code) return pagina('Enlace no válido', 'Google no devolvió el código de autorización.', 400)

  try {
    const tokens = await canjearCodigo(credencialesGoogle(), code)
    await guardarConexion(acceso.correduriaId, tokens, acceso.session.email ?? acceso.session.id)
    return pagina('Google Contacts conectado', `Cuenta ${tokens.cuentaGoogle ?? '(sin email)'}. La primera sincronización llegará con el cron horario. Puedes cerrar esta pestaña.`, 200)
  } catch (e) {
    const m = e instanceof Error ? e.message : 'error desconocido'
    console.error('[google-contactos/callback] no se pudo conectar:', m.slice(0, 200))
    return pagina('No se conectó', `${m.slice(0, 200)}. No se ha guardado nada.`, 502)
  }
}
