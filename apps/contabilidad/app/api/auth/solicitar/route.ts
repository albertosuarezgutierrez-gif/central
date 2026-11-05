import { NextResponse } from 'next/server'
import { solicitarCodigo, CANAL_NO_CONECTADO } from '@/lib/acceso'
import { repoAccesoBd } from '@/lib/db'
import { ipDeCabecera } from '@/lib/ip'

// Paso 1 del login: pedir código. Respuesta IDÉNTICA exista o no el correo. El canal de correo NO está conectado
// (ninguna comunicación saliente sin OK de Alberto): el código queda «no enviado» y la pantalla lo dice.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { email?: unknown } | null
  const r = await solicitarCodigo(repoAccesoBd, CANAL_NO_CONECTADO, { email: b?.email, ip: ipDeCabecera(req.headers.get('x-forwarded-for')) })
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status, headers: r.status === 429 ? { 'retry-after': String(r.retryAfter) } : {} })
  }
  return NextResponse.json({ ok: true, enviado: r.enviado })
}
