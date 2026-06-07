import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const evento_id = new URL(req.url).searchParams.get('evento_id')
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })
  const { data, error } = await supabase.from('proveedores_evento_asignaciones')
    .select('*, proveedor:proveedores_evento(nombre, tipo, contacto_telefono, contacto_email, token_portal, portal_activo)')
    .eq('evento_id', evento_id).eq('local_id', restauranteId).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const totalComisiones = (data ?? []).reduce((a, p) => a + (p.comision_importe ?? 0), 0)
  const cobradas = (data ?? []).filter(p => p.estado === 'comision_cobrada').reduce((a, p) => a + (p.comision_importe ?? 0), 0)
  return NextResponse.json({ asignaciones: data, total_comisiones: totalComisiones, cobradas })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  let comisionPct = body.comision_pct
  let ivaTipo = body.iva_tipo ?? 21
  if (comisionPct === undefined || comisionPct === null) {
    const { data: prov } = await supabase.from('proveedores_evento').select('comision_pct, iva_tipo').eq('id', body.proveedor_id).single()
    comisionPct = prov?.comision_pct ?? 0
    ivaTipo = body.iva_tipo ?? prov?.iva_tipo ?? 21
  }
  const comisionImporte = (body.importe ?? 0) * (comisionPct ?? 0) / 100
  const { data, error } = await supabase.from('proveedores_evento_asignaciones').insert({
    evento_id: body.evento_id, proveedor_id: body.proveedor_id, local_id: restauranteId,
    servicio_descripcion: body.servicio_descripcion, importe: body.importe ?? 0,
    comision_pct: comisionPct, comision_importe: comisionImporte, iva_tipo: ivaTipo,
    hora_llegada: body.hora_llegada ?? null, briefing: body.briefing ?? null, notas: body.notas ?? null,
  }).select('*, proveedor:proveedores_evento(nombre, contacto_email, portal_activo, token_portal)').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: todas } = await supabase.from('proveedores_evento_asignaciones').select('comision_importe').eq('evento_id', body.evento_id)
  const totalComision = (todas ?? []).reduce((a, x) => a + (x.comision_importe ?? 0), 0)
  await supabase.from('eventos').update({ comision_total_estimada: totalComision }).eq('id', body.evento_id)
  return NextResponse.json({ ok: true, asignacion: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, accion, ...updates } = await req.json()
  const cambio = accion === 'cobrar_comision'
    ? { estado: 'comision_cobrada', comision_cobrada_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { ...updates, updated_at: new Date().toISOString() }
  const { error } = await supabase.from('proveedores_evento_asignaciones').update(cambio).eq('id', id).eq('local_id', restauranteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await req.json()
  await supabase.from('proveedores_evento_asignaciones').delete().eq('id', id).eq('local_id', restauranteId)
  return NextResponse.json({ ok: true })
}
