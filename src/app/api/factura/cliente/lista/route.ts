export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/factura/cliente/lista?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Lista facturas completas (serie F) emitidas a empresas
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const { searchParams } = req.nextUrl

  const desde = searchParams.get('desde') ?? new Date(Date.now() - 86400 * 7 * 1000).toISOString().slice(0, 10)
  const hasta = searchParams.get('hasta') ?? new Date().toISOString().slice(0, 10)

  const { data, error, count } = await supabase
    .from('facturas_cliente')
    .select('*', { count: 'exact' })
    .eq('local_id', restaurante_id)
    .gte('created_at', `${desde}T00:00:00`)
    .lte('created_at', `${hasta}T23:59:59`)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    facturas: data ?? [],
    total: count ?? 0,
  })
}
