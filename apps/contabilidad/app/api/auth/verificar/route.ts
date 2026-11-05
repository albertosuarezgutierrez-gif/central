import { NextResponse } from 'next/server'
import { verificarCodigo, empresaInicial } from '@/lib/acceso'
import { repoAccesoBd } from '@/lib/db'
import { COOKIE_NAME, cookieOpts, emitirCookie } from '@/lib/sesion-cookie'

// Paso 2: canjear el código. Con una empresa se entra directo; con varias (gestor) la sesión nace SIN empresa y el
// middleware lleva al selector (/empresas). La elección se revalida en BD.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { email?: unknown; codigo?: unknown } | null
  const r = await verificarCodigo(repoAccesoBd, { email: b?.email, codigo: b?.codigo })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  const e = empresaInicial(r.empresas)
  const res = NextResponse.json({ ok: true, destino: e ? '/' : '/empresas' })
  res.cookies.set(COOKIE_NAME, await emitirCookie({ u: r.usuario.id, e, sv: r.usuario.sv }, new Date()), cookieOpts())
  return res
}
