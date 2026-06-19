export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET /api/cocina/parte
 * Devuelve el catálogo de recetas (con escandallo) y los eventos del local,
 * con la forma que esperan los módulos @central/module-trazabilidad
 * (FichaCatalogo[] + EventoInput[]) para generar el parte del día.
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const [recetasRes, ingRes, eventosRes, asignRes] = await Promise.all([
    supabase.from('cocina_recetas').select('*').eq('local_id', rid).eq('archivada', false).order('created_at'),
    supabase.from('cocina_receta_ingredientes').select('*').order('orden'),
    supabase.from('cocina_eventos').select('*').eq('local_id', rid).eq('archivado', false).order('fecha_evento'),
    supabase.from('cocina_evento_elaboraciones').select('*'),
  ])

  const recetasRaw = recetasRes.data ?? []
  const recetaIds  = new Set(recetasRaw.map(r => r.id))
  const eventos    = eventosRes.data ?? []
  const eventoIds  = new Set(eventos.map(e => e.id))

  const ingredientesPorReceta = new Map<string, Array<Record<string, unknown>>>()
  for (const ing of (ingRes.data ?? [])) {
    if (!recetaIds.has(ing.receta_id)) continue
    const arr = ingredientesPorReceta.get(ing.receta_id) ?? []
    arr.push({
      nombre: ing.nombre,
      por_pax: Number(ing.por_pax),
      unidad: ing.unidad,
      ...(ing.desinfeccion ? { desinfeccion: ing.desinfeccion } : {}),
      ...(ing.descongelacion ? { descongelacion: true } : {}),
    })
    ingredientesPorReceta.set(ing.receta_id, arr)
  }

  const recetas = recetasRaw.map(r => ({
    id: r.id,
    nombre: r.nombre,
    partida: r.partida,
    min_por_pax: Number(r.min_por_pax),
    requiere_muestra: r.requiere_muestra,
    controles: r.controles ?? [],
    depende_de: r.depende_de ?? [],
    ingredientes: ingredientesPorReceta.get(r.id) ?? [],
  }))

  const elabsPorEvento = new Map<string, string[]>()
  for (const a of (asignRes.data ?? [])) {
    if (!eventoIds.has(a.evento_id) || !recetaIds.has(a.receta_id)) continue
    const arr = elabsPorEvento.get(a.evento_id) ?? []
    arr.push(a.receta_id)
    elabsPorEvento.set(a.evento_id, arr)
  }

  const eventosOut = eventos.map(e => ({
    id: e.id,
    nombre: e.nombre,
    pax: e.pax,
    fecha_evento: e.fecha_evento,
    ubicacion: e.ubicacion,
    evento_id: e.evento_id ?? null,
    elaboraciones: elabsPorEvento.get(e.id) ?? [],
  }))

  return NextResponse.json({ recetas, eventos: eventosOut })
}
