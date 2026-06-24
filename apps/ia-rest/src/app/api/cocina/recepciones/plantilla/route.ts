export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET /api/cocina/recepciones/plantilla?proveedor=<nombre>
 * Devuelve los productos de la última recepción de ese proveedor (pedido habitual).
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const proveedor = req.nextUrl.searchParams.get('proveedor')?.trim()
  if (!proveedor) return NextResponse.json({ ok: false }, { status: 200 })

  // Fecha de la recepción más reciente de este proveedor
  const { data: ultima } = await supabase
    .from('cocina_recepciones')
    .select('fecha')
    .eq('local_id', rid)
    .ilike('proveedor', proveedor)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!ultima?.fecha) return NextResponse.json({ ok: false })

  // Todos los productos de esa fecha (plantilla del pedido habitual)
  const { data, error } = await supabase
    .from('cocina_recepciones')
    .select('producto, proveedor, lote, temperatura, caducidad, conforme')
    .eq('local_id', rid)
    .ilike('proveedor', proveedor)
    .eq('fecha', ultima.fecha)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ ok: false })

  return NextResponse.json({ ok: true, productos: data, ultima_fecha: ultima.fecha })
}
