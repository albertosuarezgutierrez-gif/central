export const dynamic = 'force-dynamic'

// GET /api/owner/consumo
// Devuelve el consumo mensual, histórico y estado de billing del restaurante

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  if (!restaurante_id) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const { data, error } = await supabase
    .rpc('get_consumo_owner', { p_restaurante_id: restaurante_id })

  if (error) {
    console.error('[owner/consumo]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
