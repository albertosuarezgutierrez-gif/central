import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE_NAME, cookieOpts, emitirCookie, leerCookie } from '@/lib/sesion-cookie'
import { personaVigente, rolEn } from '@/lib/db'
import { esUuid } from '@/lib/rls'

// Selector de empresa: SIEMPRE revalidado en BD (miembro activo). Misma caducidad absoluta de la sesión.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const s = await leerCookie((await cookies()).get(COOKIE_NAME)?.value, new Date())
  if (!s || !(await personaVigente(s.p, s.sv))) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as { cuentaId?: unknown } | null
  if (!esUuid(b?.cuentaId)) return NextResponse.json({ error: 'empresa_no_valida' }, { status: 400 })
  const c = b!.cuentaId.toLowerCase()
  if (!(await rolEn(s.p, c))) return NextResponse.json({ error: 'sin_acceso' }, { status: 403 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, await emitirCookie({ p: s.p, c, sv: s.sv }, new Date(), s.exp), cookieOpts())
  return res
}
