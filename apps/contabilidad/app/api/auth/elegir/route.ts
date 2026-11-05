import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE_NAME, cookieOpts, emitirCookie, leerCookie } from '@/lib/sesion-cookie'
import { sesionVigenteBd } from '@/lib/db'
import { esUuid } from '@/lib/rls'

// Elegir (o cambiar de) empresa: SIEMPRE revalidado contra `usuario_empresas` en BD. Misma caducidad absoluta de la sesión.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const s = await leerCookie((await cookies()).get(COOKIE_NAME)?.value, new Date())
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as { empresaId?: unknown } | null
  const empresaId = b?.empresaId
  if (!esUuid(empresaId)) return NextResponse.json({ error: 'empresa no válida' }, { status: 400 })
  const rol = await sesionVigenteBd(s.u, empresaId.toLowerCase(), s.sv)
  if (!rol) return NextResponse.json({ error: 'Sin acceso a esa empresa' }, { status: 403 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, await emitirCookie({ u: s.u, e: empresaId.toLowerCase(), sv: s.sv }, new Date(), s.exp), cookieOpts())
  return res
}
