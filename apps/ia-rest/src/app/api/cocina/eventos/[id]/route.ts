export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { buildElaboracionRows } from '@/lib/cocina-elaboraciones'

/** PATCH /api/cocina/eventos/[id] — edita un evento (+ reemplaza asignación si llega `elaboraciones`) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.nombre !== undefined)       patch.nombre = String(body.nombre).trim()
  if (body.fecha_evento !== undefined) patch.fecha_evento = body.fecha_evento || null
  if (body.pax !== undefined)          patch.pax = Number.isFinite(+body.pax) ? +body.pax : 0
  if (body.ubicacion !== undefined)    patch.ubicacion = String(body.ubicacion).trim()

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('cocina_eventos').update(patch).eq('id', id).eq('local_id', rid)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Si llega `elaboraciones` (o `dietas`), reemplazamos TODO el menú del evento
  // (principal + grupos de dieta). La UI envía siempre ambos juntos.
  if (Array.isArray(body.elaboraciones) || Array.isArray(body.dietas)) {
    await supabase.from('cocina_evento_elaboraciones').delete().eq('evento_id', id)
    const rows = buildElaboracionRows(id, body)
    if (rows.length > 0) {
      await supabase.from('cocina_evento_elaboraciones').insert(rows)
    }
  }

  return NextResponse.json({ ok: true })
}

/** DELETE /api/cocina/eventos/[id] — borra el evento (cascada en asignaciones) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { error } = await supabase.from('cocina_eventos').delete().eq('id', id).eq('local_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
