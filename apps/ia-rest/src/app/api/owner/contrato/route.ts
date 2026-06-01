export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, resolverRestauranteIdDeCuenta } from '@/lib/session'

// GET /api/owner/contrato?restaurante_id=xxx
// Devuelve la última aceptación del contrato para este restaurante
export async function GET(req: NextRequest) {
  try {
    // Sesión FIRMADA + rol owner/super_admin (antes solo comprobaba que el header existiera)
    const session = getSession(req)
    if (!session || !['owner', 'super_admin'].includes(session.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sb = createServerClient()

    // El restaurante_id de la query solo se acepta si pertenece a la cuenta de la
    // sesión (o si es super_admin). Evita leer contratos/IP de otros tenants.
    const { searchParams } = new URL(req.url)
    const restaurante_id = await resolverRestauranteIdDeCuenta(
      sb, session, searchParams.get('restaurante_id'),
    )
    if (!restaurante_id) {
      return NextResponse.json({ error: 'Restaurante no autorizado' }, { status: 403 })
    }

    const { data, error } = await sb
      .from('contract_acceptances')
      .select('accepted_at, contract_version, ip_address')
      .eq('local_id', restaurante_id)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ aceptacion: data ?? null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
