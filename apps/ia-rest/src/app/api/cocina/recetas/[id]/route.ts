export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

type IngIn = { nombre?: string; por_pax?: number | string; unidad?: string; desinfeccion?: unknown; descongelacion?: boolean }

/** PATCH /api/cocina/recetas/[id] — edita la receta (+ reemplaza escandallo si llega `ingredientes`) */
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
  if (body.nombre !== undefined)           patch.nombre = String(body.nombre).trim()
  if (body.partida !== undefined)          patch.partida = body.partida || null
  if (body.min_por_pax !== undefined)      patch.min_por_pax = Number.isFinite(+body.min_por_pax) ? +body.min_por_pax : 0.4
  if (body.requiere_muestra !== undefined) patch.requiere_muestra = !!body.requiere_muestra
  if (Array.isArray(body.controles))       patch.controles = body.controles
  if (Array.isArray(body.depende_de))      patch.depende_de = body.depende_de

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('cocina_recetas').update(patch).eq('id', id).eq('local_id', rid)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(body.ingredientes)) {
    await supabase.from('cocina_receta_ingredientes').delete().eq('receta_id', id)
    const rows = body.ingredientes
      .filter((i: IngIn) => i && String(i.nombre ?? '').trim())
      .map((i: IngIn, orden: number) => ({
        receta_id: id,
        nombre: String(i.nombre).trim(),
        por_pax: Number.isFinite(+(i.por_pax ?? 0)) ? +(i.por_pax ?? 0) : 0,
        unidad: i.unidad || 'g',
        desinfeccion: i.desinfeccion ?? null,
        descongelacion: !!i.descongelacion,
        orden,
      }))
    if (rows.length > 0) await supabase.from('cocina_receta_ingredientes').insert(rows)
  }

  return NextResponse.json({ ok: true })
}

/** DELETE /api/cocina/recetas/[id] — borra la receta (cascada en escandallo y asignaciones) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { error } = await supabase.from('cocina_recetas').delete().eq('id', id).eq('local_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
