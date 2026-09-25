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
// Y /api/webhooks: los receptores de Resend y de Codeoscopic traen su propia auth
// (firma svix / HTTP Basic); sin la exención el vendor recibía el HTML del login.
// /api/publico: endpoints sin sesión pensados para que los abra un tercero desde
// un enlace de email (p.ej. la baja de recaptación) — igual que /api/publico/*
// en apps/plataforma.
// /api/cron: el scheduler de Vercel llama sin cookie, con Bearer CRON_SECRET que cada ruta
// valida (lib/cron-auth.ts, cerrada sin la env). Sin la exención TODOS los crons morían en
// 307 hacia /login y ninguno llegó a ejecutarse (medido 25/09/2026: felicitaciones, avisos…).
const PUBLIC = ['/login', '/api/auth', '/api/operador', '/api/portal', '/api/webhooks', '/api/publico', '/api/cron']

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
