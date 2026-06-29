import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { listFlotaHolding } from '@/lib/flota-holding'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await getAdmin().catch(() => null)
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const posiciones = await listFlotaHolding()
  return NextResponse.json({ posiciones, ahora: new Date().toISOString() })
}
