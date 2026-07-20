import { NextRequest, NextResponse } from 'next/server'
import { tokenInvitadoValido, COOKIE_INVITADO } from '@/lib/trading-acceso'

export const dynamic = 'force-dynamic'

// Entrada del enlace de invitado: valida ?token= contra la BD y, si es válido, fija la cookie httpOnly
// y redirige a la pantalla. Así el enlace persiste sin que un server component tenga que fijar cookies.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const destino = new URL('/invitado/trading', req.url)
  const res = NextResponse.redirect(destino)
  if (await tokenInvitadoValido(token)) {
    res.cookies.set(COOKIE_INVITADO, token as string, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 2_592_000,
    })
  }
  return res
}
