export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { propinas_activas, propinas_reparto_modo, propinas_opciones_eur } = await req.json()
  await supabase.from('restaurantes').update({ propinas_activas, propinas_reparto_modo, propinas_opciones_eur }).eq('id', rid)
  return NextResponse.json({ ok: true })
}
