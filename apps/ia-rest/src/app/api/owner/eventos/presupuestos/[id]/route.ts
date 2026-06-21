import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// PATCH /api/owner/eventos/presupuestos/[id] — aprobar descuento / marcar senal / cobrar comision
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { accion, ...rest } = body

  let updates: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() }

  if (accion === 'aprobar_descuento') {
    updates = { descuento_aprobado_por: session.id, descuento_aprobado_at: new Date().toISOString() }
  } else if (accion === 'senal_recibida') {
    updates = { senal_recibida: true, senal_recibida_at: new Date().toISOString() }
  } else if (accion === 'cobrar_comision') {
    updates = { comision_estado: 'cobrada', comision_cobrada_at: new Date().toISOString() }
  }

  const { data, error } = await supabase
    .from('presupuestos_evento')
    .update(updates)
    .eq('id', id)
    .eq('local_id', restauranteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ presupuesto: data })
}
