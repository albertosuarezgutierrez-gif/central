// POST /api/comanda/[id]/item
// Añade items a una comanda existente + registra en audit_log

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: comanda_id } = await params
    const supabase = createServerClient()
    const rid = getRestauranteId(req)
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    const { items } = await req.json() as {
      items: { nombre: string; cantidad: number; notas?: string; precio_unitario?: number; producto_id?: string; formato_id?: string; formato_nombre?: string; seccion_id?: string }[]
    }
    if (!items?.length) return NextResponse.json({ error: 'items requeridos' }, { status: 400 })

    // Verificar que la comanda pertenece al restaurante
    const { data: comanda } = await supabase
      .from('comandas').select('id, estado').eq('id', comanda_id).eq('restaurante_id', rid).single()
    if (!comanda) return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })

    // Insertar items
    const insertados = await supabase.from('comanda_items').insert(
      items.map(it => ({
        comanda_id, restaurante_id: rid,
        nombre: it.nombre, cantidad: it.cantidad,
        notas: it.notas ?? null,
        precio_unitario: it.precio_unitario ?? null,
        producto_id: it.producto_id ?? null,
        formato_id: it.formato_id ?? null,
        formato_nombre: it.formato_nombre ?? null,
        seccion_id: it.seccion_id ?? null,
      }))
    ).select()

    // Audit log por cada item añadido
    for (const it of items) {
      await supabase.rpc('log_comanda_accion', {
        p_comanda_id: comanda_id, p_camarero_id: session.id,
        p_accion: 'añadir_item', p_item_nombre: it.nombre,
        p_cant_antes: 0, p_cant_despues: it.cantidad,
      })
    }

    return NextResponse.json({ ok: true, items: insertados.data })
  } catch (err) {
    console.error('[COMANDA ITEM POST]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
