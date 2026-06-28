import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { listPosicionesUltimas } from '@/lib/transporte-repo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const posiciones = await listPosicionesUltimas(s.id)
  return NextResponse.json({ posiciones, ahora: new Date().toISOString() })
}
