import { NextResponse } from 'next/server'
import { COOKIE_EMPLEADO } from '@/lib/empleado-auth'

/** Cierra la sesión del empleado en ESTE dispositivo (borra la cookie). */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_EMPLEADO, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
