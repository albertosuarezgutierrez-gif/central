export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const body = await req.json()

  const { error } = await supabase
    .from('cobros_grupo')
    .update({ estado: body.estado })
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  // Verificar que pertenece al restaurante
  const { data: portal } = await supabase
    .from('cobros_grupo')
    .select('id')
    .eq('id', id)
    .eq('restaurante_id', rid)
    .single()
  if (!portal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Verificar que no tiene pagos completados
  const { count } = await supabase
    .from('cobros_grupo_pagos')
    .select('id', { count: 'exact', head: true })
    .eq('cobro_grupo_id', id)
    .eq('estado', 'pagado')
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'No se puede eliminar: tiene pagos registrados' }, { status: 409 })
  }

  // Eliminar ítems primero (FK), luego pagos pendientes, luego el portal
  await supabase.from('cobros_grupo_pagos').delete().eq('cobro_grupo_id', id)
  await supabase.from('cobros_grupo_items').delete().eq('cobro_grupo_id', id)
  const { error } = await supabase.from('cobros_grupo').delete().eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
