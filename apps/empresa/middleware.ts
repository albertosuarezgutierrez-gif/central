import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, leerCookie } from './lib/sesion-cookie'

// Gate de sesión (solo FIRMA; la vigencia real se revalida en BD en cada página/API con lib/contexto.ts).
// Públicas: el login y su API, y `/api/operador/` (Bearer HERRAMIENTAS_OPERADOR_SECRET, comprobado en cada ruta).
const PUBLICAS = ['/login', '/api/auth/solicitar', '/api/auth/verificar', '/api/operador/']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`))) return NextResponse.next()
  const s = await leerCookie(req.cookies.get(COOKIE_NAME)?.value, new Date())
  if (!s) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const url = new URL('/login', req.url)
    if (pathname !== '/') url.searchParams.set('volver', pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon\\.ico|brand/).*)'] }
