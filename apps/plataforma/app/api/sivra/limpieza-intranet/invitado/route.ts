import { NextRequest, NextResponse } from 'next/server'
import { tokenInvitadoValido, COOKIE_INVITADO } from '@/lib/limpieza-acceso'

export const dynamic = 'force-dynamic'

// Entrada del enlace de la limpieza (Si que Brilla): valida ?token= contra la BD y, si es válido, fija la
// cookie httpOnly y redirige a la pantalla. Mismo patrón que /api/trading/invitado.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const destino = new URL('/invitado/limpieza', req.url)
  const res = NextResponse.redirect(destino)
  if (await tokenInvitadoValido(token)) {
    res.cookies.set(COOKIE_INVITADO, token as string, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 15_552_000, // 180 días: es su acceso habitual
    })
  }
  return res
}
