import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST /api/owner/fuera-carta/stock
// Headers: x-ia-session (JSON con sesión)
// Body: { accion: 'decrementar' | 'reponer', producto_id, cantidad?, nuevo_stock? }
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const session = getSession(req)

    if (!session || !['owner', 'jefe_sala', 'super_admin'].includes(session.rol)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }

    const rid = getRestauranteId(req)
    const body = await req.json()
    const { accion, producto_id } = body
    const cantidad   = Math.max(1, Number(body.cantidad ?? 1))
    const nuevo_stock = body.nuevo_stock != null ? Number(body.nuevo_stock) : null

    if (!producto_id) {
      return NextResponse.json({ error: 'producto_id requerido' }, { status: 400 })
    }
    if (!['decrementar', 'reponer'].includes(accion)) {
      return NextResponse.json({ error: 'accion debe ser decrementar o reponer' }, { status: 400 })
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

    // reponer
    if (nuevo_stock !== null && (isNaN(nuevo_stock) || nuevo_stock < 1)) {
      return NextResponse.json({ error: 'nuevo_stock debe ser ≥ 1' }, { status: 400 })
    }
    const { error } = await supabase.rpc('reponer_stock_fuera_carta', {
      p_producto_id:    producto_id,
      p_restaurante_id: rid,
      p_nuevo_stock:    nuevo_stock,
    })
    if (error) throw error
    return NextResponse.json({ ok: true })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
