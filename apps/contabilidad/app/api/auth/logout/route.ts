import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE_NAME, leerCookie } from '@/lib/sesion-cookie'
import { cerrarSesionesBd } from '@/lib/db'

// «Salir»: sube la versión de sesión del usuario en BD (cualquier copia de la cookie deja de valer) y borra la cookie.
export const dynamic = 'force-dynamic'

export async function POST() {
  const s = await leerCookie((await cookies()).get(COOKIE_NAME)?.value, new Date())
  if (s) await cerrarSesionesBd(s.u)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 })
  return res
}
