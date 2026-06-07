export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET — lista recomendaciones del restaurante (hoy + últimos 7 días)
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  if (!['owner', 'jefe_sala', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  const restaurante_id = await getRestauranteId(req)
  if (!restaurante_id) return NextResponse.json({ error: 'Sin restaurante' }, { status: 400 })

  const db = createServerClient()
  const hace7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const { data, error } = await db
    .from('recomendaciones_carta')
    .select(`id, producto_id, nota, hora_desde, hora_hasta, cantidad_max, cantidad_servida, fecha, activa, created_at,
             productos(nombre, precio, categoria)`)
    .eq('local_id', restaurante_id)
    .gte('fecha', hace7)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recomendaciones: data ?? [] })
}

// POST — crear
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  if (!['owner', 'jefe_sala', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  const restaurante_id = await getRestauranteId(req)
  if (!restaurante_id) return NextResponse.json({ error: 'Sin restaurante' }, { status: 400 })

  const { producto_id, nota, hora_desde, hora_hasta, cantidad_max, fecha } = await req.json()
  if (!producto_id) return NextResponse.json({ error: 'producto_id requerido' }, { status: 400 })

  const db = createServerClient()
  const { data, error } = await db
    .from('recomendaciones_carta')
    .insert({
      restaurante_id,
      producto_id,
      nota:        nota?.trim()             || null,
      hora_desde:  hora_desde               || null,
      hora_hasta:  hora_hasta               || null,
      cantidad_max: cantidad_max ? parseInt(String(cantidad_max)) : null,
      fecha:       fecha || new Date().toISOString().split('T')[0],
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// PATCH — editar (owner) o incrementar_servida (camarero)
export async function PATCH(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const restaurante_id = await getRestauranteId(req)
  if (!restaurante_id) return NextResponse.json({ error: 'Sin restaurante' }, { status: 400 })

  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const db = createServerClient()

  // Camarero: solo puede anotar "1 servido"
  if (session.rol === 'camarero') {
    if (!body.incrementar) return NextResponse.json({ error: 'No permitido' }, { status: 403 })
    const { data: rec, error: re } = await db
      .from('recomendaciones_carta')
      .select('cantidad_servida')
      .eq('id', id)
      .eq('local_id', restaurante_id)
      .single()
    if (re || !rec) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    await db.from('recomendaciones_carta').update({ cantidad_servida: (rec.cantidad_servida ?? 0) + 1 }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // Owner / jefe_sala
  if (!['owner', 'jefe_sala', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const allowed = ['nota', 'hora_desde', 'hora_hasta', 'cantidad_max', 'cantidad_servida', 'activa', 'fecha']
  const patch: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) patch[k] = body[k] === '' ? null : body[k]
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })

  const { error } = await db
    .from('recomendaciones_carta')
    .update(patch)
    .eq('id', id)
    .eq('local_id', restaurante_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE
export async function DELETE(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  if (!['owner', 'jefe_sala', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  const restaurante_id = await getRestauranteId(req)
  if (!restaurante_id) return NextResponse.json({ error: 'Sin restaurante' }, { status: 400 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db
    .from('recomendaciones_carta')
    .delete()
    .eq('id', id)
    .eq('local_id', restaurante_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
