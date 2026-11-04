import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, leerCookie } from './lib/sesion-cookie'

// Gate de sesión: todo exige PIN salvo el login y su API.
const PUBLIC = ['/login', '/api/auth', '/brand']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()
  const s = await leerCookie(req.cookies.get(COOKIE_NAME)?.value, new Date())
  if (!s) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
