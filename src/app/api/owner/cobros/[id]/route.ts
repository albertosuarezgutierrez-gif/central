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

  // Campos permitidos para actualizar
  const update: Record<string, unknown> = {}
  if (body.estado !== undefined) update.estado = body.estado
  if (body.modo_seleccion !== undefined) {
    update.modo_seleccion = body.modo_seleccion === 'varias' ? 'varias' : 'una'
  }
  if (body.permitir_cantidades !== undefined) {
    update.permitir_cantidades = update.modo_seleccion === 'varias' || body.modo_seleccion === 'varias'
      ? body.permitir_cantidades === true
      : false
  }
  if (body.max_seleccion !== undefined) {
    update.max_seleccion = body.max_seleccion > 0 ? parseInt(body.max_seleccion) : null
  }
  if (body.mensaje_confirmacion !== undefined) {
    update.mensaje_confirmacion = body.mensaje_confirmacion?.trim() || null
  }

  const { error } = await supabase
    .from('cobros_grupo')
    .update(update)
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

  const { data: portal } = await supabase
    .from('cobros_grupo')
    .select('id')
    .eq('id', id)
    .eq('restaurante_id', rid)
    .single()
  if (!portal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { count } = await supabase
    .from('cobros_grupo_pagos')
    .select('id', { count: 'exact', head: true })
    .eq('cobro_grupo_id', id)
    .eq('estado', 'pagado')
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'No se puede eliminar: tiene pagos registrados' }, { status: 409 })
  }

  await supabase.from('cobros_grupo_pagos').delete().eq('cobro_grupo_id', id)
  await supabase.from('cobros_grupo_items').delete().eq('cobro_grupo_id', id)
  const { error } = await supabase.from('cobros_grupo').delete().eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
