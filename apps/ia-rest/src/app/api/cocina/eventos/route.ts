export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/** POST /api/cocina/eventos — crea un evento (+ asignación de elaboraciones) */
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const body = await req.json()
  const nombre = String(body.nombre ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const { data: ev, error } = await supabase
    .from('cocina_eventos')
    .insert({
      local_id: rid,
      nombre,
      fecha_evento: body.fecha_evento || null,
      pax: Number.isFinite(+body.pax) ? +body.pax : 0,
      ubicacion: body.ubicacion?.trim() || nombre,
    })
    .select('id')
    .single()
  if (error || !ev) return NextResponse.json({ error: error?.message ?? 'Error creando evento' }, { status: 500 })

  const elaboraciones: string[] = Array.isArray(body.elaboraciones) ? body.elaboraciones : []
  if (elaboraciones.length > 0) {
    await supabase.from('cocina_evento_elaboraciones')
      .insert(elaboraciones.map(receta_id => ({ evento_id: ev.id, receta_id })))
  }

  return NextResponse.json({ id: ev.id })
}
