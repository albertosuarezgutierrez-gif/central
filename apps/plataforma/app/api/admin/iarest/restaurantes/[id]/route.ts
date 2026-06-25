export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { fetchIarest, iarestError } from '@/lib/iarest-port'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Sesión de operador no válida' }, { status: 401 })
  const { id } = await params
  const res = await fetchIarest(`/api/admin/restaurantes/${id}`)
  if (!res || !res.ok) return iarestError(res)
  return NextResponse.json(await res.json())
}
