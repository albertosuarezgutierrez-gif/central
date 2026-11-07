import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, leerCookie } from './lib/sesion-cookie'

// Gate de sesión (solo FIRMA; la vigencia real se revalida en BD en cada página/API con `lib/contexto.ts`).
// Públicas: el login y su API; `/api/hechos` (Bearer por vertical, comprobado en la ruta); `/api/operador/` (Bearer del operador); `/api/cron/` (Bearer CRON_SECRET, comprobado en la ruta).
// `/api/auth/traspaso`: entrada desde «Mi empresa» (token de un solo uso, comprobado en la ruta).
const PUBLICAS = ['/login', '/api/auth/solicitar', '/api/auth/verificar', '/api/auth/traspaso', '/api/hechos', '/api/operador/', '/api/cron/']
// Con sesión pero SIN empresa elegida todavía (gestor con varias): solo el selector, elegir y salir.
// `/gestoria` (portal) lista varias empresas del gestor: no exige elegir una; sus datos salen de BD por usuario y cada empresa va en su propia transacción RLS.
const SIN_EMPRESA = ['/empresas', '/gestoria', '/api/auth/elegir', '/api/auth/logout']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`))) return NextResponse.next()
  const s = await leerCookie(req.cookies.get(COOKIE_NAME)?.value, new Date())
  if (!s) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (!s.e && !SIN_EMPRESA.includes(pathname)) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Elige empresa' }, { status: 409 })
    return NextResponse.redirect(new URL('/empresas', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|brand/).*)'],
}
