import { NextRequest, NextResponse } from 'next/server'

const KEY = process.env.SUPER_ACCESS_KEY

/**
 * GET /api/auth/super-shield?k=<SUPER_ACCESS_KEY>
 *
 * Si la clave es correcta → establece cookie __super_shield y redirige a /super.
 * Si es incorrecta → 404 silencioso (no revela que esta ruta existe).
 *
 * Cookie: HttpOnly + Secure + SameSite=Strict, duración 8h.
 * Nota: esta ruta está FUERA del namespace /api/super para no ser bloqueada
 * por el propio middleware que protege /super.
 */
export async function GET(req: NextRequest) {
  const k = req.nextUrl.searchParams.get('k')

  if (!KEY || !k || k !== KEY) {
    return new NextResponse(null, { status: 404 })
  }

  const res = NextResponse.redirect(new URL('/super', req.url))

  res.cookies.set('__super_shield', KEY, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 8, // 8 horas
    path: '/',
  })

  return res
}
