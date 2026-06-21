export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const ROLES = ['responsable', 'cocinero', 'preparacion']

// Solo el/la responsable (o co-responsable) puede gestionar el equipo.
async function exigirResponsable(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const rid = getRestauranteId(req)
  const { data: yo } = await supabase
    .from('personal').select('cocina_rol').eq('id', session.id).eq('local_id', rid).maybeSingle()
  if (yo?.cocina_rol !== 'responsable')
    return { error: NextResponse.json({ error: 'Solo el responsable puede gestionar el equipo' }, { status: 403 }) }
  return { supabase, rid }
}

/** GET /api/cocina/personal — equipo de cocina del local */
export async function GET(req: NextRequest) {
  const ctx = await exigirResponsable(req)
  if (ctx.error) return ctx.error
  const { supabase, rid } = ctx
  const { data, error } = await supabase
    .from('personal')
    .select('id, nombre, pin, cocina_rol, partidas, activo')
    .eq('local_id', rid).eq('rol', 'cocina')
    .order('cocina_rol').order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ equipo: data ?? [] })
}

/** POST /api/cocina/personal — alta de miembro del equipo */
export async function POST(req: NextRequest) {
  const ctx = await exigirResponsable(req)
  if (ctx.error) return ctx.error
  const { supabase, rid } = ctx
  const body = await req.json()

  const nombre = String(body.nombre ?? '').trim()
  const pin = String(body.pin ?? '')
  const cocina_rol = ROLES.includes(body.cocina_rol) ? body.cocina_rol : 'cocinero'
  const partidas = Array.isArray(body.partidas) ? body.partidas : []
  if (!nombre || !/^\d{4}$/.test(pin))
    return NextResponse.json({ error: 'Nombre y PIN de 4 dígitos requeridos' }, { status: 400 })

  const { data: existing } = await supabase
    .from('personal').select('id').eq('pin', pin).eq('local_id', rid).maybeSingle()
  if (existing) return NextResponse.json({ error: 'PIN ya en uso en este local' }, { status: 409 })

  const { data, error } = await supabase.from('personal')
    .insert({ nombre, pin, rol: 'cocina', activo: true, local_id: rid, cocina_rol, partidas: cocina_rol === 'cocinero' ? partidas : [] })
    .select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}

/** PUT /api/cocina/personal — editar miembro */
export async function PUT(req: NextRequest) {
  const ctx = await exigirResponsable(req)
  if (ctx.error) return ctx.error
  const { supabase, rid } = ctx
  const body = await req.json()
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  if (body.pin !== undefined) {
    if (!/^\d{4}$/.test(String(body.pin)))
      return NextResponse.json({ error: 'PIN debe tener 4 dígitos' }, { status: 400 })
    const { data: existing } = await supabase
      .from('personal').select('id').eq('pin', String(body.pin)).eq('local_id', rid).neq('id', id).maybeSingle()
    if (existing) return NextResponse.json({ error: 'PIN ya en uso en este local' }, { status: 409 })
  }

  const updates: Record<string, unknown> = {}
  if (body.nombre !== undefined)     updates.nombre = String(body.nombre).trim()
  if (body.pin !== undefined)        updates.pin = String(body.pin)
  if (body.cocina_rol !== undefined) updates.cocina_rol = ROLES.includes(body.cocina_rol) ? body.cocina_rol : 'cocinero'
  if (body.partidas !== undefined)   updates.partidas = Array.isArray(body.partidas) ? body.partidas : []
  if (body.activo !== undefined)     updates.activo = !!body.activo
  // Si pasa a no-cocinero, limpia partidas
  if (updates.cocina_rol && updates.cocina_rol !== 'cocinero') updates.partidas = []

  const { error } = await supabase.from('personal').update(updates).eq('id', id).eq('local_id', rid).eq('rol', 'cocina')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** DELETE /api/cocina/personal — borrar miembro (si FK lo impide, usar baja con activo:false) */
export async function DELETE(req: NextRequest) {
  const ctx = await exigirResponsable(req)
  if (ctx.error) return ctx.error
  const { supabase, rid } = ctx
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const { error } = await supabase.from('personal').delete().eq('id', id).eq('local_id', rid).eq('rol', 'cocina')
  if (error) return NextResponse.json({ error: 'No se puede borrar (tiene registros). Dale de baja en su lugar.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
