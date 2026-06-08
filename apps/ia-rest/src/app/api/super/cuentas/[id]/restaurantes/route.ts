export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: cuentaId } = await params
  const s = getSession(req)
  if (s?.rol !== 'super_admin') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const sb = createServerClient()
  const { restaurante_id } = await req.json()
  const { error } = await sb.from('restaurantes')
    .update({ cuenta_id: cuentaId })
    .eq('id', restaurante_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await params
  const s = getSession(req)
  if (s?.rol !== 'super_admin') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const sb = createServerClient()
  const { restaurante_id } = await req.json()
  const { error } = await sb.from('restaurantes')
    .update({ cuenta_id: null })
    .eq('id', restaurante_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
