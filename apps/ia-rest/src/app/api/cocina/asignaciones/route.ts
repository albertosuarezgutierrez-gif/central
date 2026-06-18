export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

function hoy(): string { return new Date().toISOString().slice(0, 10) }

/** GET /api/cocina/asignaciones?fecha=YYYY-MM-DD — reparto del día */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const fecha = req.nextUrl.searchParams.get('fecha') || hoy()
  const { data, error } = await supabase
    .from('cocina_asignaciones').select('receta_id, trabajador_id, origen').eq('local_id', rid).eq('fecha', fecha)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fecha, asignaciones: data ?? [] })
}

/**
 * POST /api/cocina/asignaciones
 * - action 'set':  { receta_id, trabajador_id }            → ajuste manual de Carmen (origen='manual')
 * - action 'bulk': { asignaciones:[{receta_id,trabajador_id}], origen } → propuesta IA (origen='ia')
 * Solo responsable.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { data: yo } = await supabase
    .from('personal').select('cocina_rol').eq('id', session.id).eq('local_id', rid).maybeSingle()
  if (yo?.cocina_rol !== 'responsable')
    return NextResponse.json({ error: 'Solo el responsable reparte' }, { status: 403 })

  const body = await req.json()
  const fecha = body.fecha || hoy()
  const ahora = new Date().toISOString()

  if (body.action === 'set') {
    const receta_id = String(body.receta_id ?? '')
    if (!receta_id) return NextResponse.json({ error: 'receta_id requerido' }, { status: 400 })
    const { error } = await supabase.from('cocina_asignaciones').upsert({
      local_id: rid, fecha, receta_id, trabajador_id: body.trabajador_id || null, origen: 'manual', updated_at: ahora,
    }, { onConflict: 'local_id,fecha,receta_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk') {
    const items = Array.isArray(body.asignaciones) ? body.asignaciones : []
    const origen = body.origen === 'manual' ? 'manual' : 'ia'
    const rows = items
      .filter((a: { receta_id?: string }) => a?.receta_id)
      .map((a: { receta_id: string; trabajador_id?: string }) => ({
        local_id: rid, fecha, receta_id: a.receta_id, trabajador_id: a.trabajador_id || null, origen, updated_at: ahora,
      }))
    if (rows.length > 0) {
      const { error } = await supabase.from('cocina_asignaciones').upsert(rows, { onConflict: 'local_id,fecha,receta_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, n: rows.length })
  }

  return NextResponse.json({ error: 'acción no válida' }, { status: 400 })
}
