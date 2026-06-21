// Proxy → ia-rest /api/admin/suscripciones. Auth: plataforma_admin cookie → Bearer OPERADOR_SHARED_SECRET.
// Solo lectura (las escrituras de Stripe se quedan en iarest.es/super).
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'

const iarestBase = () => (process.env.IAREST_URL ?? '').replace(/\/$/, '')
const secret = () => process.env.OPERADOR_SHARED_SECRET ?? ''

async function iarest(path: string, init?: RequestInit) {
  const base = iarestBase(); const s = secret()
  if (!base || !s) return null
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${s}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
  } catch { return null }
}

export async function GET(_req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const res = await iarest('/api/admin/suscripciones')
  if (!res) return NextResponse.json({ error: 'ia-rest sin conexión' }, { status: 502 })
  if (!res.ok) return NextResponse.json({ error: `ia-rest HTTP ${res.status}` }, { status: res.status })

  return NextResponse.json(await res.json())
}
