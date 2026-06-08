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

  // Compartir la cookie entre el dominio raíz y www (iarest.es ↔ www.iarest.es).
  // Sin un `domain` explícito la cookie es host-only: si se desbloquea en un
  // host y luego se navega por el otro (o hay un redirect apex↔www en medio),
  // el escudo no recibe la cookie y responde 404. En previews *.vercel.app y
  // en localhost se deja host-only: ahí un domain de iarest.es haría que el
  // navegador descartara la cookie.
  const host = req.nextUrl.hostname
  const cookieDomain = host === 'iarest.es' || host.endsWith('.iarest.es')
    ? '.iarest.es'
    : undefined

  res.cookies.set('__super_shield', KEY, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 365, // 1 año — evita re-desbloquear cada mes
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  })

  return res
}
