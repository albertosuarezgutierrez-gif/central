import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/superadmin'

export async function POST(req: Request) {
  await requireAdmin()

  const rrhhUrl = process.env.RRHH_URL?.replace(/\/$/, '')
  const rrhhSecret = process.env.RRHH_OPERADOR_SECRET
  if (!rrhhUrl || !rrhhSecret) return NextResponse.json({ error: 'RRHH_URL / RRHH_OPERADOR_SECRET no configurados' }, { status: 500 })

  const contentType = req.headers.get('content-type') || 'image/png'
  const nombre = req.headers.get('x-nombre') || ''
  const bytes = await req.arrayBuffer()

  const r = await fetch(`${rrhhUrl}/api/operador/logos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${rrhhSecret}`,
      'Content-Type': contentType,
      'x-nombre': nombre,
    },
    body: bytes,
  }).catch(() => null)

  if (!r?.ok) {
    const msg = r ? (await r.json().catch(() => ({}))).error || `HTTP ${r.status}` : 'sin conexión'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { url } = await r.json()
  return NextResponse.json({ url })
}
