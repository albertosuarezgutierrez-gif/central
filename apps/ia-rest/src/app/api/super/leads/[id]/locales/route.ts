export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const { id } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('leads_locales')
    .select('*')
    .eq('lead_id', id)
    .order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locales: data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const { id } = await params
  const supabase = createServerClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('leads_locales')
    .insert({ ...body, lead_id: id })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ local: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const { id: leadId } = await params
  const { localId } = await req.json()
  const supabase = createServerClient()
  const { error } = await supabase
    .from('leads_locales')
    .delete()
    .eq('id', localId)
    .eq('lead_id', leadId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
