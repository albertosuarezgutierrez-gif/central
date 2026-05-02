import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('camareros')
    .select('id, nombre, pin, rol, activo, created_at')
    .neq('rol', 'owner')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ camareros: data })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { nombre, pin, rol } = await req.json()

  if (!nombre || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin))
    return NextResponse.json({ error: 'Nombre y PIN de 4 dígitos requeridos' }, { status: 400 })

  // Check PIN not already taken
  const { data: existing } = await supabase
    .from('camareros').select('id').eq('pin', pin).single()
  if (existing)
    return NextResponse.json({ error: 'PIN ya en uso' }, { status: 409 })

  const { data, error } = await supabase
    .from('camareros')
    .insert({ nombre, pin, rol: rol || 'camarero', activo: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ camarero: data })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const { id, nombre, pin, rol, activo } = await req.json()

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  // If changing PIN, check not taken by another user
  if (pin) {
    if (!/^\d{4}$/.test(pin))
      return NextResponse.json({ error: 'PIN debe tener 4 dígitos' }, { status: 400 })
    const { data: existing } = await supabase
      .from('camareros').select('id').eq('pin', pin).neq('id', id).single()
    if (existing)
      return NextResponse.json({ error: 'PIN ya en uso' }, { status: 409 })
  }

  const updates: Record<string, unknown> = {}
  if (nombre !== undefined) updates.nombre = nombre
  if (pin !== undefined) updates.pin = pin
  if (rol !== undefined) updates.rol = rol
  if (activo !== undefined) updates.activo = activo

  const { data, error } = await supabase
    .from('camareros').update(updates).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ camarero: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const { id } = await req.json()

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const { error } = await supabase.from('camareros').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
