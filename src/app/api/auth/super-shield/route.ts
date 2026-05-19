import { NextRequest, NextResponse } from 'next/server'

const KEY = process.env.SUPER_ACCESS_KEY

// Rate limiting en memoria: máx 5 intentos/IP cada 15 min
const ATTEMPTS = new Map<string, { count: number; until: number }>()
const MAX = 5
const BLOCK_MS = 15 * 60 * 1000

/**
 * GET /api/auth/super-shield?k=<SUPER_ACCESS_KEY>
 *
 * Si la clave es correcta → establece cookie __super_shield y redirige a /super.
 * Si es incorrecta → 404 silencioso (no revela que esta ruta existe).
 * Rate limiting: 5 intentos por IP cada 15 min → 404 sin pista.
 *
 * Cookie: HttpOnly + Secure + SameSite=Strict, duración 30 días.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()

  // Rate limiting silencioso
  const rec = ATTEMPTS.get(ip)
  if (rec && rec.count >= MAX && now < rec.until) {
    return new NextResponse(null, { status: 404 })
  }

  const k = req.nextUrl.searchParams.get('k')

  if (!KEY || !k || k !== KEY) {
    const prev = ATTEMPTS.get(ip) ?? { count: 0, until: 0 }
    const newCount = prev.count + 1
    ATTEMPTS.set(ip, {
      count: newCount,
      until: newCount >= MAX ? now + BLOCK_MS : prev.until,
    })
    return new NextResponse(null, { status: 404 })
  }

  // Clave correcta → limpiar intentos
  ATTEMPTS.delete(ip)

  const res = NextResponse.redirect(new URL('/super', req.url))

  res.cookies.set('__super_shield', KEY, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 días
    path: '/',
  })

  return res
}
