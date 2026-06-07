export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/tienda/buscar?ean=... | ?q=... — busca productos para el TPV
// Respeta modo_catalogo (separado → solo productos es_tienda=true).
// Reutiliza productos.ean_codigo (código de barras ya existente).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const COLS = 'id, nombre, precio, categoria, ean_codigo, venta_por_peso, precio_por_kg, stock_actual, es_tienda'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const url = new URL(req.url)
  const ean = url.searchParams.get('ean')?.trim()
  const q = url.searchParams.get('q')?.trim()

  // Modo de catálogo: 'separado' → solo productos marcados es_tienda
  const { data: cfg } = await supabase
    .from('config_tienda')
    .select('modo_catalogo')
    .eq('local_id', rid)
    .maybeSingle()
  const soloTienda = cfg?.modo_catalogo === 'separado'

  let query = supabase
    .from('productos')
    .select(COLS)
    .eq('local_id', rid)
    .eq('activo', true)

  if (soloTienda) query = query.eq('es_tienda', true)

  if (ean) {
    query = query.eq('ean_codigo', ean).limit(1)
  } else if (q) {
    query = query.ilike('nombre', `%${q}%`).order('nombre').limit(50)
  } else {
    query = query.order('categoria').order('nombre').limit(100)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ productos: data ?? [], encontrado: (data?.length ?? 0) > 0 })
}
