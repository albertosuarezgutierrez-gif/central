export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// ia.rest · GET /api/owner/config-cobro
// Config rápida para CobrarSheet: saber si propinas digitales y feedback están activos

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data } = await supabase
    .from('restaurantes')
    .select('propinas_activas, feedback_activo')
    .eq('id', rid)
    .single()
  return NextResponse.json(data ?? { propinas_activas: false, feedback_activo: false })
}
