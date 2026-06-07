export const dynamic = 'force-dynamic'

// ============================================================
// GET/PUT /api/tienda/config — configuración de tienda por local
// (modo de catálogo + hardware adaptable). Tabla config_tienda.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const DEFAULTS = {
  modo_catalogo: 'mismo' as 'mismo' | 'separado',
  barcode_activo: false,
  barcode_modo: 'usb' as 'usb' | 'camara' | 'ambos',
  bascula_activa: false,
  solo_tactil: true,
  descontar_stock: true,
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const { data } = await supabase
    .from('config_tienda')
    .select('*')
    .eq('local_id', rid)
    .maybeSingle()

  return NextResponse.json({ config: data ?? { restaurante_id: rid, ...DEFAULTS } })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const body = await req.json().catch(() => ({}))
  const row = {
    local_id: rid,
    modo_catalogo: body.modo_catalogo === 'separado' ? 'separado' : 'mismo',
    barcode_activo: !!body.barcode_activo,
    barcode_modo: ['usb', 'camara', 'ambos'].includes(body.barcode_modo) ? body.barcode_modo : 'usb',
    bascula_activa: !!body.bascula_activa,
    solo_tactil: body.solo_tactil !== false,
    descontar_stock: body.descontar_stock !== false,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('config_tienda')
    .upsert(row, { onConflict: 'restaurante_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
