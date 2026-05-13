// src/app/api/owner/bridge-tokens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRestauranteId } from '@/lib/session'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const rid = getRestauranteId(req)
  const { data, error } = await sb()
    .from('bridge_tokens')
    .select('id, token, nombre, activo, ultimo_ping, created_at')
    .eq('restaurante_id', rid)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tokens: data })
}

export async function POST(req: NextRequest) {
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
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  // Verificar que el token pertenece a este restaurante antes de borrar
  const { error } = await sb()
    .from('bridge_tokens')
    .delete()
    .eq('id', id)
    .eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
