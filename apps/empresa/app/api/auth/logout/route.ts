import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE_NAME, leerCookie } from '@/lib/sesion-cookie'
import { cerrarSesiones } from '@/lib/db'

// «Salir»: sube la versión de sesión (toda copia de la cookie deja de valer). NO cierra las sesiones de las apps (se dice en pantalla).
export const dynamic = 'force-dynamic'

export async function POST() {
  const s = await leerCookie((await cookies()).get(COOKIE_NAME)?.value, new Date())
  if (s) await cerrarSesiones(s.p)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0, secure: true, httpOnly: true, sameSite: 'lax' })
  return res
}
