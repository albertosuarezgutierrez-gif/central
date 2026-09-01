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
//
// Desde el 27/07/2026 hay ADEMÁS un pass-through por `ALERTA_TOKEN` acotado a `RUTAS_RUTINA` (abajo),
// para que añadir un endpoint de rutina no dependa de acordarse de tocar esta lista — es lo que falló
// con las 2 rutas de pricing. Los dos mecanismos conviven a propósito:
//   · `/api/internal/alerta` DEBE seguir en PUBLIC: una llamada con token MALO tiene que LLEGAR al
//     handler para recibir el 401 accionable y disparar el aviso de token desincronizado. Si dependiera
//     del token, un token roto daría 307 → /login y el fallo volvería a ser mudo (justo el incidente).
//   · Las 2 de pricing están en ambos sitios. Se dejan en PUBLIC porque acaban de desbloquear el agente
//     en vivo y no se toca eso en el mismo PR; sacarlas de aquí (quedándose solo con el pass-through
//     por token, que es MÁS estrecho: exige el token para siquiera alcanzar el handler) es un
//     endurecimiento pendiente, seguro de hacer cuando el ciclo semanal confirme que va fino.
const PUBLIC = ['/login', '/register', '/api/auth', '/admin', '/api/admin', '/api/cron', '/api/ai', '/api/trading',
  '/api/sivra/mensajes/telegram-webhook', '/api/sivra/mensajes/webhook',
  '/api/banca/pago/callback', '/api/internal/alerta',
  // 🚨 Webhook de Stripe de los extras del huésped. Stripe POSTea desde SUS servidores, sin cookie
  // y sin seguir redirects: sin esta exención el gate lo manda 307 → /login, Stripe lo apunta como
  // entrega fallida y el extra se queda para siempre en `enlace_enviado` PESE A ESTAR COBRADO — el
  // huésped paga, la limpieza no se entera y el cron de impago acaba caducándolo. Detectado el
  // 28/08/2026 sondeando el endpoint en producción, antes de que llegara ningún pago real.
  // No amplía privilegio: el handler verifica la FIRMA de Stripe (`constructEvent` con
  // `STRIPE_WEBHOOK_SECRET_SIVRA` por `requireSecret`) y sin firma válida devuelve 400.
  '/api/sivra/extras/webhook',
  '/api/sivra/mercado/ingest', '/api/sivra/pricing/aplicar-propuesta',
  // TEMPORAL Fase 3 subastas: puente de exploración de fuentes (auth por token
  // en BD `subastas_debug_token`, hosts oficiales cerrados). Se retira al cerrar la fase.
  '/api/subastas/fase3-debug',
  // Calendario de la landing de House Sevillana. SIN auth a propósito y de forma acotada:
  // publica solo qué noches están cogidas de una lista blanca de pisos, que es exactamente lo
  // que el motor de reservas de Smoobu ya le enseña a cualquiera que entre en él. No sale ni un
  // huésped, ni un importe, ni un id de reserva. Un slug fuera de la lista da 400, así que
  // tampoco sirve de índice de las propiedades del grupo.
  '/api/publico']

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
  // Intranet de limpieza (Sique Brilla, sin cuenta): mismo patrón que /api/empresas. La entrada del
  // token siempre alcanzable (fija la cookie); el resto solo pasa si la cookie está presente y
  // cada handler la revalida contra la BD (accesoLimpieza). Sin cookie ni sesión → gate normal.
  if (pathname.startsWith('/api/sivra/limpieza-intranet')) {
    if (pathname.startsWith('/api/sivra/limpieza-intranet/invitado') || req.cookies.get('limpieza_invitado')) {
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
