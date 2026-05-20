import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * POST /api/owner/recepciones/confirmar
 * Body: { recepcion_id: string }
 * → Llama fn_confirmar_recepcion() → actualiza stock_actual → genera stock_movimientos
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { recepcion_id } = await req.json()
  if (!recepcion_id) return NextResponse.json({ error: 'recepcion_id requerido' }, { status: 400 })

  // Verificar que pertenece a este restaurante
  const { data: rec } = await supabase
    .from('recepciones_mercancia')
    .select('id, estado, restaurante_id')
    .eq('id', recepcion_id)
    .eq('restaurante_id', rid)
    .single()

  if (!rec) return NextResponse.json({ error: 'Recepción no encontrada' }, { status: 404 })
  if (rec.estado !== 'borrador') return NextResponse.json({ error: 'Solo se pueden confirmar recepciones en borrador' }, { status: 409 })

  const { data: resultado, error } = await supabase.rpc('fn_confirmar_recepcion', {
    p_recepcion_id: recepcion_id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, ...(resultado as object) })
}
