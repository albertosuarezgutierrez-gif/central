import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST /api/owner/fuera-carta/stock
// Body: { accion: 'decrementar' | 'reponer', producto_id, cantidad?, nuevo_stock? }
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const session = getSession(req)
    if (!session || !['owner', 'jefe_sala', 'super_admin'].includes(session.rol)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }

    const rid = getRestauranteId(req)
    const { accion, producto_id, cantidad = 1, nuevo_stock } = await req.json()

    if (!producto_id) {
      return NextResponse.json({ error: 'producto_id requerido' }, { status: 400 })
    }

    if (accion === 'decrementar') {
      const { data, error } = await supabase.rpc('decrementar_stock_fuera_carta', {
        p_producto_id:    producto_id,
        p_restaurante_id: rid,
        p_cantidad:       cantidad,
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      return NextResponse.json({ ok: true, ...result })
    }

    if (accion === 'reponer') {
      const { error } = await supabase.rpc('reponer_stock_fuera_carta', {
        p_producto_id:    producto_id,
        p_restaurante_id: rid,
        p_nuevo_stock:    nuevo_stock ?? null,
      })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'accion inválida' }, { status: 400 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
