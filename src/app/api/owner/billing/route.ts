export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function getSession(req: NextRequest) {
  const header = req.headers.get('x-ia-session')
  if (!header) return null
  try { return JSON.parse(header) } catch { return null }
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const restauranteId = searchParams.get('restaurante_id') ?? session.restaurante_id

  if (!restauranteId) {
    return NextResponse.json({ error: 'restaurante_id requerido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('get_billing_estado', {
    p_restaurante_id: restauranteId,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ billing: data })
}
