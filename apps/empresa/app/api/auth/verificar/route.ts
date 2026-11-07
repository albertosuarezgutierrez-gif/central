import { NextResponse } from 'next/server'
import { canjearCodigo, emailValido } from '@/lib/acceso'
import { repoOtpBd, personaPorEmail, marcarEmailVerificado } from '@/lib/db'
import { COOKIE_NAME, cookieOpts, emitirCookie } from '@/lib/sesion-cookie'

// Paso 2: canjear el código. La sesión nace sin cuenta elegida; con una sola cuenta, contexto.ts la toma sola.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { email?: unknown; codigo?: unknown } | null
  const r = await canjearCodigo(repoOtpBd, { email: b?.email, codigo: b?.codigo, proposito: 'acceso' })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  const p = await personaPorEmail(emailValido(b?.email)!)
  if (!p) return NextResponse.json({ error: 'sin_acceso' }, { status: 401 })
  await marcarEmailVerificado(p.id)
  const res = NextResponse.json({ ok: true, destino: '/' })
  res.cookies.set(COOKIE_NAME, await emitirCookie({ p: p.id, c: null, sv: p.sv }, new Date()), cookieOpts())
  return res
}
