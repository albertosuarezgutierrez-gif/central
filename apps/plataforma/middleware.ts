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
// (isAlertaTokenAuthorized || isCronAuthorized). Mismo motivo para las 2 rutas del agente de pricing
// (`/api/sivra/mercado/ingest`, `/api/sivra/pricing/aplicar-propuesta`): la rutina de Claude Code solo
// lleva `ALERTA_TOKEN`, no el `CRON_SECRET` maestro (por diseño, ver `lib/cron-auth.ts`) — sin esta
// exención el gate las redirige 307→/login ANTES de que sus propios `isRoutineAuthorized`/auth
// escalonada corran, dejando el ciclo semanal del agente bloqueado pese a que los handlers ya están
// preparados para recibir el token de bajo privilegio (bug real, detectado 27/07/2026: 3 ciclos
// seguidos de "Paso 4/Paso 2 bloqueado" con la causa real sin diagnosticar). No amplía privilegio:
// cada handler revalida su propio secreto/token igual que `/api/internal/alerta`.
const PUBLIC = ['/login', '/register', '/api/auth', '/admin', '/api/admin', '/api/cron', '/api/ai', '/api/trading',
  '/api/sivra/mensajes/telegram-webhook', '/api/sivra/mensajes/webhook',
  '/api/banca/pago/callback', '/api/internal/alerta',
  '/api/sivra/mercado/ingest', '/api/sivra/pricing/aplicar-propuesta']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Acceso INVITADO por token (Pablo prueba «Empresas» sin cuenta). El token real vive en BD y lo valida
  // el handler/página (runtime Node); el middleware edge (sin Prisma) solo enruta:
  //  - /invitado/*  → siempre alcanzable (la página decide: panel o «acceso no válido»).
  //  - /api/empresas/invitado → entrada que fija la cookie (valida el token en su handler).
  //  - /api/empresas/* con la cookie de invitado presente → pasa al handler, que valida contra BD.
  // Sin cookie ni sesión, /api/empresas/* sigue el gate normal de sesión (Alberto) → no abre nada.
  if (pathname.startsWith('/invitado')) return NextResponse.next()
  if (pathname.startsWith('/api/empresas')) {
    if (pathname.startsWith('/api/empresas/invitado') || req.cookies.get('empresas_invitado')) {
      return NextResponse.next()
    }
  }

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
  // Propaga el pathname para que los server components (p.ej. la guarda de rol del layout) lo lean.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-pathname', pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
