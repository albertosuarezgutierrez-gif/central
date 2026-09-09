import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifySessionToken } from './lib/auth'

// Gate de sesión de la vertical Asegura. Público: login + sus APIs de auth,
// y el puerto de operador (plataforma → asegura), que trae su PROPIA auth por
// Bearer ASEGURA_OPERADOR_SECRET (lib/operador.ts, cerrado por defecto) — sin
// esta exención el middleware redirige la llamada servidor→servidor al login
// y plataforma recibe HTML en vez de JSON. Lo mismo para /api/portal, el puente
// del portal del cliente (asegura-portal → asegura): auth propia por Bearer
// ASEGURA_PORTAL_PUENTE_SECRET (lib/puente-portal.ts); sin la exención la
// llamada servidor→servidor recibía el HTML del login en vez del JSON.
const PUBLIC = ['/login', '/api/auth', '/api/operador', '/api/portal']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next()

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
