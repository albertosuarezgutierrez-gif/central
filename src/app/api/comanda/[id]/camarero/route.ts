export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: comanda_id } = await params
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { camarero_destino_id } = await req.json()
  if (!camarero_destino_id) return NextResponse.json({ error: 'camarero_destino_id requerido' }, { status: 400 })

  const { data: comanda } = await supabase
    .from('comandas').select('id, mesa_id, estado, camarero_id')
    .eq('id', comanda_id).eq('local_id', restaurante_id).single()
  if (!comanda) return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })
  if (comanda.estado === 'cerrada') return NextResponse.json({ error: 'Comanda cerrada' }, { status: 400 })

  const { data: turnoDestino } = await supabase
    .from('turnos').select('id')
    .eq('camarero_id', camarero_destino_id).eq('local_id', restaurante_id).eq('estado', 'activo').maybeSingle()
  if (!turnoDestino) return NextResponse.json({ error: 'El camarero destino no está en turno' }, { status: 400 })

  const { data: camareroDestino } = await supabase
    .from('personal').select('nombre').eq('id', camarero_destino_id).eq('local_id', restaurante_id).single()
  if (!camareroDestino) return NextResponse.json({ error: 'Camarero no encontrado' }, { status: 404 })

  await supabase.from('comandas').update({ camarero_id: camarero_destino_id }).eq('id', comanda_id).eq('local_id', restaurante_id)
  if (comanda.mesa_id) {
    await supabase.from('mesas').update({ camarero_id: camarero_destino_id }).eq('id', comanda.mesa_id).eq('local_id', restaurante_id)
  }
  await supabase.from('comanda_audit').insert({
    comanda_id, local_id: restaurante_id,
    camarero_id: session.id,
    camarero_nombre: session.nombre ?? 'Sistema',
    accion: 'transferencia',
    notas_despues: `Transferida a ${camareroDestino.nombre}`,
  }).select().maybeSingle()

  return NextResponse.json({ ok: true, camarero_nuevo: camareroDestino.nombre })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: turnos } = await supabase
    .from('turnos').select('camarero_id')
    .eq('local_id', restaurante_id).eq('estado', 'activo')
    .not('camarero_id', 'is', null).neq('camarero_id', session.id)

  const ids = (turnos ?? []).map((t: { camarero_id: string }) => t.camarero_id).filter(Boolean)
  if (!ids.length) return NextResponse.json({ camareros: [] })

  const { data: personal } = await supabase.from('personal').select('id, nombre').in('id', ids)
  return NextResponse.json({ camareros: personal ?? [] })
}
