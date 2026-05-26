export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const [{ data: propinas }, { data: rest }] = await Promise.all([
    supabase.from('propinas').select('id,importe,estado,created_at,pagada_at,reparto,token')
      .eq('restaurante_id', rid).order('created_at', { ascending: false }).limit(100),
    supabase.from('restaurantes').select('propinas_activas,propinas_reparto_modo,propinas_opciones_eur').eq('id', rid).single(),
  ])
  return NextResponse.json({ propinas: propinas ?? [], config: rest ?? {} })
}
