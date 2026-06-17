// Proxy → ia-rest /api/admin/soporte. Auth: plataforma_admin cookie → Bearer OPERADOR_SHARED_SECRET.
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

export async function GET(req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const estado = req.nextUrl.searchParams.get('estado')
  const qs = estado ? `?estado=${encodeURIComponent(estado)}` : ''

  const res = await iarest(`/api/admin/soporte${qs}`)
  if (!res) return NextResponse.json({ error: 'ia-rest sin conexión' }, { status: 502 })
  if (!res.ok) return NextResponse.json({ error: `ia-rest HTTP ${res.status}` }, { status: res.status })

  return NextResponse.json(await res.json())
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const res = await iarest('/api/admin/soporte', { method: 'POST', body: JSON.stringify(body) })
  if (!res) return NextResponse.json({ error: 'ia-rest sin conexión' }, { status: 502 })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    return NextResponse.json({ error: e.error || `HTTP ${res.status}` }, { status: res.status })
  }
  return NextResponse.json(await res.json())
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const res = await iarest('/api/admin/soporte', { method: 'PATCH', body: JSON.stringify(body) })
  if (!res) return NextResponse.json({ error: 'ia-rest sin conexión' }, { status: 502 })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    return NextResponse.json({ error: e.error || `HTTP ${res.status}` }, { status: res.status })
  }
  return NextResponse.json(await res.json())
}
