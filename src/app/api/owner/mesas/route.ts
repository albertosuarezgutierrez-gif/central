import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('mesas')
    .select('id, codigo, zona, capacidad, estado')
    .order('codigo', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mesas: data })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { codigo, zona, capacidad } = await req.json()

  if (!codigo || !zona)
    return NextResponse.json({ error: 'Código y zona requeridos' }, { status: 400 })

  const { data: existing } = await supabase
    .from('mesas').select('id').eq('codigo', codigo).single()
  if (existing)
    return NextResponse.json({ error: 'Código ya existe' }, { status: 409 })

  const { data, error } = await supabase
    .from('mesas')
    .insert({ codigo, zona, capacidad: capacidad || 4 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mesa: data })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const { id, codigo, zona, capacidad } = await req.json()

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (codigo !== undefined) updates.codigo = codigo
  if (zona !== undefined) updates.zona = zona
  if (capacidad !== undefined) updates.capacidad = capacidad

  const { data, error } = await supabase
    .from('mesas').update(updates).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mesa: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const { id } = await req.json()

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const { error } = await supabase.from('mesas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
