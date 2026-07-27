import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifySessionToken } from './lib/auth'
import { esRutaDeRutina } from './lib/rutas-rutina'

// El área de OPERADOR (/admin) gestiona su propia auth (cookie plataforma_admin,
// validada en los route handlers vía getAdmin) → se exime del gate de cuenta.
// `/api/ai` es la pasarela de IA: su propia auth es un secreto Bearer (AI_GATEWAY_SECRET),
// no la cookie de cuenta → se exime del gate.
// Los webhooks entrantes traen su PROPIA auth (secret de Telegram / `?k=` de Smoobu), no la
// cookie de cuenta → se eximen del gate (si no, el middleware los redirige 307 → /login y el
// servicio externo, que no sigue redirects, los toma como fallo: el botón de Telegram se cuelga).
// `/api/internal/alerta` sigue en PUBLIC A PROPÓSITO, aunque el pass-through de ALERTA_TOKEN de
// abajo ya la cubra: es el endpoint de aviso, y una llamada con token MALO tiene que LLEGAR al
// handler para recibir un 401 accionable (y disparar el aviso de token desincronizado). Si
// dependiera del token, un token roto daría 307 → /login y el fallo volvería a ser mudo.
const PUBLIC = ['/login', '/register', '/api/auth', '/admin', '/api/admin', '/api/cron', '/api/ai', '/api/trading',
  '/api/sivra/mensajes/telegram-webhook', '/api/sivra/mensajes/webhook',
  '/api/banca/pago/callback', '/api/internal/alerta']

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

  // Rutinas de Claude Code: llegan con el token DEDICADO de bajo privilegio (`ALERTA_TOKEN`),
  // no con la llave maestra ni con cookie de sesión. Sin esta excepción, un handler abierto con
  // `isRoutineAuthorized` es igualmente inalcanzable (307 → /login antes de correr) — que es lo
  // que tuvo al agente de pricing bloqueado 3 ciclos. Se limita a `RUTAS_RUTINA` (fuente única,
  // verificada por `test/regression-rutas-rutina.test.ts`): el token NO abre el resto de la app.
  // Header-only, igual que en el handler: nunca por `?secret=` (se filtra por logs/Referer).
  const alertaToken = process.env.ALERTA_TOKEN
  if (alertaToken && esRutaDeRutina(pathname)) {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (bearer === alertaToken) return NextResponse.next()
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
