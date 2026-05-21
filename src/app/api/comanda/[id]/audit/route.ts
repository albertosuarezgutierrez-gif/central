export const dynamic = 'force-dynamic'

// GET /api/comanda/[id]/audit — historial de cambios de una comanda
// Usado por el panel super/owner para ver quién tocó qué

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: comanda_id } = await params
    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    const { data, error } = await supabase
      .from('comanda_audit_log')
      .select('id, accion, camarero_nombre, item_nombre, item_cantidad_antes, item_cantidad_despues, notas_antes, notas_despues, es_propietario, created_at')
      .eq('comanda_id', comanda_id)
      .eq('restaurante_id', rid)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ audit: data ?? [] })
  } catch (err) {
    console.error('[AUDIT GET]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
