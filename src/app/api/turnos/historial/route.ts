export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  let session: { id: string; restaurante_id: string; rol: string } | null = null
  try {
    const h = req.headers.get('x-ia-session')
    session = h ? JSON.parse(h) : null
  } catch { /* noop */ }

  if (!session?.restaurante_id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!['owner', 'jefe_sala', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const url = new URL(req.url)
  const desde = url.searchParams.get('desde') ?? new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const hasta = url.searchParams.get('hasta') ?? new Date().toISOString().split('T')[0]
  const camarero_id = url.searchParams.get('camarero_id')

  const supabase = createServerClient()

  let q = supabase
    .from('turnos')
    .select(`
      id, nombre, fecha, estado, entrada_at, salida_at,
      horas_totales, tipo, notas,
      camarero_id,
      camareros!inner(nombre, rol)
    `)
    .eq('restaurante_id', session.restaurante_id)
    .not('camarero_id', 'is', null)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('entrada_at', { ascending: false })

  if (camarero_id) q = q.eq('camarero_id', camarero_id)

  const { data, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Trabajadores que están AHORA en turno activo
  const { data: activos } = await supabase
    .from('turnos')
    .select('id, camarero_id, entrada_at, camareros!inner(nombre, rol)')
    .eq('restaurante_id', session.restaurante_id)
    .eq('estado', 'activo')
    .not('camarero_id', 'is', null)

  return NextResponse.json({ fichajes: data ?? [], activos: activos ?? [] })
}

// PATCH: el owner puede añadir una nota a un fichaje
export async function PATCH(req: NextRequest) {
  let session: { id: string; restaurante_id: string; rol: string } | null = null
  try {
    const h = req.headers.get('x-ia-session')
    session = h ? JSON.parse(h) : null
  } catch { /* noop */ }

  if (!session?.restaurante_id) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['owner', 'jefe_sala', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { turno_id, notas, salida_at } = await req.json()
  if (!turno_id) return NextResponse.json({ error: 'turno_id requerido' }, { status: 400 })

  const supabase = createServerClient()
  const update: Record<string, unknown> = {}
  if (notas !== undefined) update.notas = notas
  if (salida_at !== undefined) {
    update.salida_at = salida_at
    update.estado = 'cerrado'
    // recalcular horas si se ajusta la salida manualmente
  }

  const { error } = await supabase
    .from('turnos')
    .update(update)
    .eq('id', turno_id)
    .eq('restaurante_id', session.restaurante_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
