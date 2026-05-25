import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServerClient()
  const { data: proveedor, error } = await supabase.from('proveedores_evento')
    .select('id, nombre, tipo, contacto_nombre, restaurante_id')
    .eq('token_portal', token).eq('portal_activo', true).single()
  if (error || !proveedor) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 })
  const hace60 = new Date(); hace60.setDate(hace60.getDate() - 60)
  const { data: asignaciones } = await supabase.from('proveedores_evento_asignaciones')
    .select('id, servicio_descripcion, importe, hora_llegada, briefing, estado, confirmado_proveedor_at, notas, evento:eventos(id, nombre, fecha_evento, aforo_confirmado, hora_inicio, espacio:espacios_evento(nombre, direccion))')
    .eq('proveedor_id', proveedor.id).gte('created_at', hace60.toISOString()).order('created_at', { ascending: false })
  return NextResponse.json({ proveedor, asignaciones: asignaciones ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServerClient()
  const body = await req.json()
  const { data: proveedor } = await supabase.from('proveedores_evento').select('id, nombre').eq('token_portal', token).eq('portal_activo', true).single()
  if (!proveedor) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  const { error } = await supabase.from('proveedores_evento_asignaciones').update({ estado: 'confirmado', confirmado_proveedor_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.asignacion_id).eq('proveedor_id', proveedor.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: asig } = await supabase.from('proveedores_evento_asignaciones').select('servicio_descripcion, evento:eventos!inner(nombre)').eq('id', body.asignacion_id).single()
  const eventoNombre = (asig?.evento as unknown as { nombre: string } | null)?.nombre ?? '-'
  await tgAlert(`✅ <b>Proveedor confirmó</b>\n${proveedor.nombre}\nEvento: ${eventoNombre}\nServicio: ${asig?.servicio_descripcion ?? '-'}`, 'info')
  return NextResponse.json({ ok: true })
}
