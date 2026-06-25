// Proxy → ia-rest /api/admin/soporte. Auth: plataforma_admin cookie → Bearer OPERADOR_SHARED_SECRET.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { fetchIarest, iarestError } from '@/lib/iarest-port'

export async function GET(req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Sesión de operador no válida' }, { status: 401 })

  const estado = req.nextUrl.searchParams.get('estado')
  const qs = estado ? `?estado=${encodeURIComponent(estado)}` : ''

  const res = await fetchIarest(`/api/admin/soporte${qs}`)
  if (!res || !res.ok) return iarestError(res)
  return NextResponse.json(await res.json())
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Sesión de operador no válida' }, { status: 401 })

  const body = await req.json()
  const res = await fetchIarest('/api/admin/soporte', { method: 'POST', body: JSON.stringify(body) })
  if (!res || !res.ok) return iarestError(res)
  return NextResponse.json(await res.json())
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Sesión de operador no válida' }, { status: 401 })

  const body = await req.json()
  const res = await fetchIarest('/api/admin/soporte', { method: 'PATCH', body: JSON.stringify(body) })
  if (!res || !res.ok) return iarestError(res)
  return NextResponse.json(await res.json())
}
