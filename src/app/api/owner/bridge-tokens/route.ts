// src/app/api/owner/bridge-tokens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const sb = () => createServerClient()
const ROLES = ['owner', 'super_admin', 'jefe_sala']

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || !ROLES.includes(session.rol))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const { data, error } = await sb()
    .from('bridge_tokens')
    .select('id, token, nombre, activo, ultimo_ping, rol, en_wifi, ip_lan, platform, device_name')
    .eq('restaurante_id', rid)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tokens: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || !ROLES.includes(session.rol))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const { nombre } = await req.json()
  const { data, error } = await sb()
    .from('bridge_tokens')
    .insert({ nombre: nombre || 'Bridge local', restaurante_id: rid })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token: data })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session || !ROLES.includes(session.rol))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { error } = await sb()
    .from('bridge_tokens')
    .delete()
    .eq('id', id)
    .eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
