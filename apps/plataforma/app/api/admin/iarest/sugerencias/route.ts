// Proxy → ia-rest /api/admin/sugerencias. Auth: plataforma_admin cookie → Bearer OPERADOR_SHARED_SECRET.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { fetchIarest, iarestError } from '@/lib/iarest-port'

export async function GET(req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Sesión de operador no válida' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const params = new URLSearchParams()
  if (searchParams.get('estado'))    params.set('estado', searchParams.get('estado')!)
  if (searchParams.get('categoria')) params.set('categoria', searchParams.get('categoria')!)
  if (searchParams.get('no_leidas')) params.set('no_leidas', searchParams.get('no_leidas')!)
  const qs = params.toString() ? `?${params.toString()}` : ''

  const res = await fetchIarest(`/api/admin/sugerencias${qs}`)
  if (!res || !res.ok) return iarestError(res)
  return NextResponse.json(await res.json())
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Sesión de operador no válida' }, { status: 401 })

  const body = await req.json()
  const res = await fetchIarest('/api/admin/sugerencias', { method: 'PATCH', body: JSON.stringify(body) })
  if (!res || !res.ok) return iarestError(res)
  return NextResponse.json(await res.json())
}
