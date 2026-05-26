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
    .from('leads_contactos')
    .select('*, local:leads_locales(id, nombre)')
    .eq('lead_id', id)
    .order('es_decisor', { ascending: false })
    .order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contactos: data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const { id } = await params
  const supabase = createServerClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('leads_contactos')
    .insert({ ...body, lead_id: id, local_id: body.local_id || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacto: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const { id: leadId } = await params
  const supabase = createServerClient()
  const { contactoId, ...updates } = await req.json()
  const { data, error } = await supabase
    .from('leads_contactos')
    .update(updates)
    .eq('id', contactoId)
    .eq('lead_id', leadId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacto: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const { id: leadId } = await params
  const { contactoId } = await req.json()
  const supabase = createServerClient()
  const { error } = await supabase
    .from('leads_contactos')
    .delete()
    .eq('id', contactoId)
    .eq('lead_id', leadId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
