export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET — agrega productividad por cocinero/partida (estimado vs real).
// query: ?rango=hoy|semana (default hoy)
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const url = new URL(req.url)
  const rango = url.searchParams.get('rango') ?? 'hoy'

  const hoy = new Date()
  let desdeFecha: string
  if (rango === 'semana') {
    const d = new Date(hoy)
    d.setDate(d.getDate() - 6) // últimos 7 días
    desdeFecha = d.toISOString().slice(0, 10)
  } else {
    desdeFecha = hoy.toISOString().slice(0, 10)
  }
  const hastaFecha = hoy.toISOString().slice(0, 10)

  const [tareasRes, personalRes] = await Promise.all([
    supabase
      .from('produccion_tareas')
      .select('personal_id, seccion_cocina_id, estado, tiempo_estimado_min, tiempo_real_min, fecha')
      .eq('restaurante_id', rid)
      .gte('fecha', desdeFecha)
      .lte('fecha', hastaFecha),
    supabase
      .from('personal')
      .select('id, nombre')
      .eq('local_id', rid),
  ])

  const tareas = tareasRes.data ?? []
  const nombrePorId = new Map<string, string>()
  for (const p of personalRes.data ?? []) nombrePorId.set(p.id, p.nombre)

  // Agregación por cocinero
  type Agg = { personal_id: string; nombre: string; estimado_min: number; real_min: number; num_tareas: number; hechas: number }
  const porCocinero = new Map<string, Agg>()
  // Agregación por partida (seccion_cocina_id)
  const porPartida = new Map<string, { seccion_cocina_id: string | null; estimado_min: number; real_min: number; num_tareas: number; hechas: number }>()

  for (const t of tareas) {
    const est = Number(t.tiempo_estimado_min) || 0
    const real = Number(t.tiempo_real_min) || 0
    const hecha = t.estado === 'hecha'

    const cid = t.personal_id ?? 'sin_asignar'
    if (!porCocinero.has(cid)) {
      porCocinero.set(cid, {
        personal_id: cid,
        nombre: nombrePorId.get(cid) ?? (cid === 'sin_asignar' ? 'Sin asignar' : cid),
        estimado_min: 0, real_min: 0, num_tareas: 0, hechas: 0,
      })
    }
    const ac = porCocinero.get(cid)!
    ac.num_tareas += 1
    if (hecha) { ac.estimado_min += est; ac.real_min += real; ac.hechas += 1 }

    const pid = t.seccion_cocina_id ?? 'sin_partida'
    if (!porPartida.has(pid)) {
      porPartida.set(pid, { seccion_cocina_id: t.seccion_cocina_id ?? null, estimado_min: 0, real_min: 0, num_tareas: 0, hechas: 0 })
    }
    const ap = porPartida.get(pid)!
    ap.num_tareas += 1
    if (hecha) { ap.estimado_min += est; ap.real_min += real; ap.hechas += 1 }
  }

  const cocineros = Array.from(porCocinero.values()).map(c => ({
    ...c,
    pct_productividad: c.real_min > 0 ? Math.round((c.estimado_min / c.real_min) * 100) : null,
  }))
  const partidas = Array.from(porPartida.values()).map(p => ({
    ...p,
    pct_productividad: p.real_min > 0 ? Math.round((p.estimado_min / p.real_min) * 100) : null,
  }))

  return NextResponse.json({ cocineros, partidas, rango, desde: desdeFecha, hasta: hastaFecha })
}
