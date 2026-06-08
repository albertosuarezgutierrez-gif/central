export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { data } = await supabase
    .from('cashdro_comandos')
    .select('*')
    .eq('local_id', rid)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })
    .limit(10)
  return NextResponse.json({ comandos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const rid = getRestauranteId(req)
  const { accion, importe, referencia } = await req.json()
  if (!accion) return NextResponse.json({ error: 'accion requerida' }, { status: 400 })
  const supabase = createServerClient()
  const { data: config } = await supabase
    .from('cobro_config').select('cashdro_activo, cashdro_url').eq('local_id', rid).maybeSingle()
  if (!config?.cashdro_activo || !config?.cashdro_url)
    return NextResponse.json({ error: 'Cashdro no configurado' }, { status: 400 })
  const { data: comando, error } = await supabase
    .from('cashdro_comandos')
    .insert({ local_id: rid, camarero_id: session.id, accion, importe: importe ?? null, referencia: referencia ?? null, estado: 'pendiente' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, comando_id: comando.id })
}

export async function PATCH(req: NextRequest) {
  const rid = getRestauranteId(req)
  const { id, estado, resultado } = await req.json()
  if (!id || !estado) return NextResponse.json({ error: 'id y estado requeridos' }, { status: 400 })
  const supabase = createServerClient()
  const { error } = await supabase
    .from('cashdro_comandos')
    .update({ estado, resultado: resultado ?? null, ejecutado_at: new Date().toISOString() })
    .eq('id', id).eq('local_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
