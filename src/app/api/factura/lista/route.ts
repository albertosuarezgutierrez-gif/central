export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/factura/lista?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&page=0
// Lista facturas para la vista de auditoría del owner
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export const runtime = 'nodejs'
const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const { searchParams } = req.nextUrl

  const desde = searchParams.get('desde') ?? new Date(Date.now() - 86400 * 7 * 1000).toISOString().slice(0, 10)
  const hasta = searchParams.get('hasta') ?? new Date().toISOString().slice(0, 10)
  const page  = parseInt(searchParams.get('page') ?? '0', 10)
  const from  = page * PAGE_SIZE
  const to    = from + PAGE_SIZE - 1

  const { data, error, count } = await supabase
    .from('facturas_verifactu')
    .select('*', { count: 'exact' })
    .eq('local_id', restaurante_id)
    .gte('fecha_expedicion', `${desde}T00:00:00`)
    .lte('fecha_expedicion', `${hasta}T23:59:59`)
    .order('numero_factura', { ascending: false })
    .range(from, to)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    facturas: data ?? [],
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / PAGE_SIZE),
  })
}
