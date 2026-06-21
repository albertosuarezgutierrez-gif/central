export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

type IngIn = { nombre?: string; por_pax?: number | string; unidad?: string; desinfeccion?: unknown; descongelacion?: boolean }

function ingredientesRows(recetaId: string, ingredientes: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(ingredientes)) return []
  return ingredientes
    .filter((i: IngIn) => i && String(i.nombre ?? '').trim())
    .map((i: IngIn, orden: number) => ({
      receta_id: recetaId,
      nombre: String(i.nombre).trim(),
      por_pax: Number.isFinite(+(i.por_pax ?? 0)) ? +(i.por_pax ?? 0) : 0,
      unidad: i.unidad || 'g',
      desinfeccion: i.desinfeccion ?? null,
      descongelacion: !!i.descongelacion,
      orden,
    }))
}

/** POST /api/cocina/recetas — crea una receta (+ escandallo) */
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const body = await req.json()
  const nombre = String(body.nombre ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const { data: rec, error } = await supabase
    .from('cocina_recetas')
    .insert({
      local_id: rid,
      nombre,
      partida: body.partida || null,
      min_por_pax: Number.isFinite(+body.min_por_pax) ? +body.min_por_pax : 0.4,
      requiere_muestra: body.requiere_muestra ?? true,
      controles: Array.isArray(body.controles) ? body.controles : [],
      depende_de: Array.isArray(body.depende_de) ? body.depende_de : [],
    })
    .select('id')
    .single()
  if (error || !rec) return NextResponse.json({ error: error?.message ?? 'Error creando receta' }, { status: 500 })

  const rows = ingredientesRows(rec.id, body.ingredientes)
  if (rows.length > 0) await supabase.from('cocina_receta_ingredientes').insert(rows)

  return NextResponse.json({ id: rec.id })
}
