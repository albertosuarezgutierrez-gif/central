// PATCH /api/comanda/[id]/item/[itemId] — modificar cantidad/notas
// DELETE /api/comanda/[id]/item/[itemId] — eliminar item
// Ambos verifican restaurante_id y registran en audit_log

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: comanda_id, itemId: item_id } = await params
    const supabase = createServerClient()
    const rid = getRestauranteId(req)
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    const { cantidad, notas } = await req.json() as { cantidad?: number; notas?: string }

    // Leer estado actual del item (verificando restaurante_id)
    const { data: itemActual } = await supabase
      .from('comanda_items')
      .select('nombre, cantidad, notas')
      .eq('id', item_id)
      .eq('restaurante_id', rid)
      .single()
    if (!itemActual) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })

    // Actualizar
    const update: Record<string, unknown> = {}
    if (cantidad !== undefined) update.cantidad = cantidad
    if (notas !== undefined) update.notas = notas
    await supabase.from('comanda_items').update(update).eq('id', item_id).eq('restaurante_id', rid)

    // Audit log
    await supabase.rpc('log_comanda_accion', {
      p_comanda_id: comanda_id, p_camarero_id: session.id,
      p_accion: 'modificar_item', p_item_nombre: itemActual.nombre,
      p_cant_antes: itemActual.cantidad,
      p_cant_despues: cantidad ?? itemActual.cantidad,
      p_notas_antes: itemActual.notas,
      p_notas_despues: notas ?? itemActual.notas,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[ITEM PATCH]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: comanda_id, itemId: item_id } = await params
    const supabase = createServerClient()
    const rid = getRestauranteId(req)
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    // Leer item verificando restaurante_id antes de borrar
    const { data: itemActual } = await supabase
      .from('comanda_items')
      .select('nombre, cantidad')
      .eq('id', item_id)
      .eq('restaurante_id', rid)
      .single()

    if (!itemActual) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })

    await supabase.from('comanda_items').delete().eq('id', item_id).eq('restaurante_id', rid)

    await supabase.rpc('log_comanda_accion', {
      p_comanda_id: comanda_id, p_camarero_id: session.id,
      p_accion: 'eliminar_item', p_item_nombre: itemActual.nombre,
      p_cant_antes: itemActual.cantidad, p_cant_despues: 0,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[ITEM DELETE]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
