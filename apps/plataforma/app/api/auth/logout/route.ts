import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifySessionToken } from '@/lib/auth'
import { ADMIN_COOKIE } from '@/lib/superadmin'
import { revocarSesion } from '@/lib/sesiones-db'

export async function POST(req: NextRequest) {
  // Revoca SOLO la sesión de este dispositivo (sesiones por dispositivo, 19/09/2026). Best-effort:
  // la cookie se borra igual aunque la BD no responda.
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (token) {
    const payload = await verifySessionToken(token)
    if (payload) await revocarSesion(payload.cuentaId, payload.jti).catch(() => {})
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  res.cookies.set(ADMIN_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
