import { NextResponse } from 'next/server'
import { solicitarCodigo, CANAL_NO_CONECTADO } from '@/lib/acceso'
import { canalCodigos } from '@/lib/canal-correo'
import { repoOtpBd, personaPorEmail } from '@/lib/db'
import { ipDeCabecera } from '@/lib/ip'

// Paso 1 del login: código por correo. 503 canal_no_disponible (sin proveedor) ≠ 502 envio_fallido. Respuesta idéntica exista o no.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { email?: unknown } | null
  const canal = canalCodigos() ?? (process.env.NODE_ENV === 'development' ? CANAL_NO_CONECTADO : null)
  if (!canal) return NextResponse.json({ error: 'canal_no_disponible' }, { status: 503 })
  const r = await solicitarCodigo(repoOtpBd, canal, {
    email: b?.email, ip: ipDeCabecera(req.headers.get('x-forwarded-for')), proposito: 'acceso',
    destinatarioValido: async (email) => (await personaPorEmail(email)) !== null,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: r.status === 429 ? { 'retry-after': String(r.retryAfter) } : undefined })
  return NextResponse.json({ ok: true, enviado: r.enviado })
}
