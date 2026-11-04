import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, RENOVAR_CADA_MS, cookieOpts, leerCookie, renovarCookie } from './lib/sesion-cookie'

// Gate de sesión: todo exige PIN salvo el login y su API.
// `/api/operador/`: puerto de operador (Bearer propio, sin PIN).
// `/p/<token>`: enlace público de aceptación de presupuesto (sin login; la autorización es el token).
const PUBLIC = ['/login', '/api/auth', '/brand', '/p/', '/api/operador/']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()
  const s = await leerCookie(req.cookies.get(COOKIE_NAME)?.value, new Date())
  if (!s) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', req.url))
  }
  const res = NextResponse.next()
  // Sesión deslizante: la actividad se anota (como mucho 1×/min) para el cierre por inactividad. El fin absoluto no se mueve.
  const ahora = new Date()
  if (ahora.getTime() - s.act >= RENOVAR_CADA_MS) {
    res.cookies.set(COOKIE_NAME, await renovarCookie(s, ahora), cookieOpts(Math.max(1, Math.ceil((s.exp - ahora.getTime()) / 60_000))))
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
