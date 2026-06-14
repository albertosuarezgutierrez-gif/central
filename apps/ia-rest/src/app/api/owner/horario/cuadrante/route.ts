export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { compararPrevistoReal, type TurnoFichaje, type TurnoPrevisto } from '@central/module-horario'

/**
 * Cuadrante / plantilla (previsto vs real).
 * GET    ?desde&hasta → { comparativa, previstos }
 * POST   { camarero_id, camarero_nombre?, fecha, hora_inicio, hora_fin, tipo?, notas? } → crea previsto
 * DELETE ?id=<uuid> → elimina un previsto
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const hoy = new Date()
  const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
  const desde = searchParams.get('desde') ?? primeroMes
  const hasta = searchParams.get('hasta') ?? hoy.toISOString().split('T')[0]

  const { data: prevRows, error: e1 } = await supabase
    .from('turnos_previstos')
    .select('id, camarero_id, camarero_nombre, fecha, hora_inicio, hora_fin, tipo')
    .eq('local_id', rid).gte('fecha', desde).lte('fecha', hasta)
    .order('fecha', { ascending: true })
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  const { data: realRows, error: e2 } = await supabase
    .from('turnos')
    .select('camarero_id, fecha, entrada_at, salida_at, horas_totales, tipo')
    .eq('local_id', rid).eq('estado', 'cerrado')
    .gte('fecha', desde).lte('fecha', hasta)
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  const { data: cams } = await supabase.from('camareros').select('id, nombre').eq('local_id', rid)
  const nombre = new Map<string, string>((cams ?? []).map(c => [c.id as string, c.nombre as string]))

  const previstos: TurnoPrevisto[] = (prevRows ?? []).map(p => ({
    camarero_id: p.camarero_id,
    camarero_nombre: p.camarero_nombre ?? (p.camarero_id ? nombre.get(p.camarero_id) ?? null : null),
    fecha: p.fecha, hora_inicio: p.hora_inicio, hora_fin: p.hora_fin, tipo: p.tipo,
  }))
  const reales: TurnoFichaje[] = (realRows ?? []).map(t => ({
    camarero_id: t.camarero_id,
    camarero_nombre: t.camarero_id ? nombre.get(t.camarero_id) ?? null : null,
    fecha: t.fecha, entrada_at: t.entrada_at, salida_at: t.salida_at,
    horas_totales: t.horas_totales != null ? Number(t.horas_totales) : null,
    tipo: t.tipo,
  }))

  return NextResponse.json({
    ok: true, desde, hasta,
    comparativa: compararPrevistoReal(previstos, reales),
    previstos: prevRows ?? [],
  })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json().catch(() => ({}))
  if (!body.fecha || !body.hora_inicio || !body.hora_fin) {
    return NextResponse.json({ error: 'fecha, hora_inicio y hora_fin son obligatorios' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('turnos_previstos')
    .insert({
      local_id: rid,
      camarero_id: body.camarero_id ?? null,
      camarero_nombre: body.camarero_nombre?.trim() || null,
      fecha: body.fecha,
      hora_inicio: body.hora_inicio,
      hora_fin: body.hora_fin,
      tipo: body.tipo || 'normal',
      notas: body.notas?.trim() || null,
      creado_por: session.id,
    })
    .select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const { error } = await supabase.from('turnos_previstos').delete().eq('local_id', rid).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
