import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifySessionToken } from './lib/auth'

// El área de OPERADOR (/admin) gestiona su propia auth (cookie plataforma_admin,
// validada en los route handlers vía getAdmin) → se exime del gate de cuenta.
// `/api/ai` es la pasarela de IA: su propia auth es un secreto Bearer (AI_GATEWAY_SECRET),
// no la cookie de cuenta → se exime del gate.
// Los webhooks entrantes traen su PROPIA auth (secret de Telegram / `?k=` de Smoobu), no la
// cookie de cuenta → se eximen del gate (si no, el middleware los redirige 307 → /login y el
// servicio externo, que no sigue redirects, los toma como fallo: el botón de Telegram se cuelga).
// `/api/internal/alerta` acepta su token DEDICADO (ALERTA_TOKEN) además del CRON_SECRET, así que
// no puede depender del pass-through de CRON_SECRET de abajo → se exime aquí y su handler revalida
// (isAlertaTokenAuthorized || isCronAuthorized). Solo esa ruta; mapa-arquitectura sigue gateado.
const PUBLIC = ['/login', '/register', '/api/auth', '/admin', '/api/admin', '/api/cron', '/api/ai',
  '/api/sivra/mensajes/telegram-webhook', '/api/sivra/mensajes/webhook',
  '/api/banca/pago/callback', '/api/internal/alerta']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()

  // Crons de Vercel: llegan SIN cookie de sesión pero CON `Authorization: Bearer CRON_SECRET`
  // (Vercel lo adjunta a toda invocación de cron cuando la env existe). Sin esta excepción, el
  // gate de sesión los redirige 307 → /login y el handler nunca corre (así murieron los crons
  // migrados bajo /api/sivra/*). Cada handler revalida el secreto (isCronAuthorized), de modo
  // que esto NO abre los endpoints de datos: el tráfico de navegador sin secreto sigue gateado.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const qs = req.nextUrl.searchParams.get('secret')
    if (bearer === cronSecret || qs === cronSecret) return NextResponse.next()
  }

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
