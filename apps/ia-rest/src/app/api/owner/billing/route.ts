export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, resolverRestauranteIdDeCuenta } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supabase = createServerClient()

  // El restaurante_id de la query solo se acepta si pertenece a la cuenta de la
  // sesión (o si es super_admin). Evita IDOR sobre la facturación de otros tenants.
  const { searchParams } = new URL(req.url)
  const restauranteId = await resolverRestauranteIdDeCuenta(
    supabase, session, searchParams.get('restaurante_id'),
  )
  if (!restauranteId) {
    return NextResponse.json({ error: 'Restaurante no autorizado' }, { status: 403 })
  }

  const { data, error } = await supabase.rpc('get_billing_estado', {
    p_restaurante_id: restauranteId,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ billing: data })
}
