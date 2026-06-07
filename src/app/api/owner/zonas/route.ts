export const dynamic = 'force-dynamic'

// ============================================================
// /api/owner/zonas — CRUD de zonas del local
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data, error } = await supabase
    .from('zonas')
    .select('id, nombre, tipo, prefijo, descripcion, orden, activa')
    .eq('local_id', rid)
    .order('orden')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { nombre, tipo, prefijo, descripcion, orden } = await req.json()
  if (!nombre || !prefijo) return NextResponse.json({ error: 'nombre y prefijo requeridos' }, { status: 400 })

  // Si no viene tipo explícito, generar slug único desde el nombre
  let tipoFinal: string = tipo || ''
  if (!tipoFinal) {
    const slug = (nombre as string)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // quitar acentos
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20) || 'zona'

    // Verificar unicidad dentro del restaurante
    const { data: existing } = await supabase
      .from('zonas')
      .select('tipo')
      .eq('local_id', rid)
      .ilike('tipo', `${slug}%`)

    const usados = new Set(existing?.map(z => z.tipo) ?? [])
    tipoFinal = slug
    if (usados.has(tipoFinal)) {
      let n = 2
      while (usados.has(`${slug}_${n}`)) n++
      tipoFinal = `${slug}_${n}`
    }
  }

  const { data, error } = await supabase
    .from('zonas')
    .insert({ nombre, tipo: tipoFinal, prefijo: prefijo.toUpperCase(), descripcion, orden: orden ?? 99, local_id: rid })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id, nombre, tipo, prefijo, descripcion, orden, activa } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  if (nombre !== undefined) updates.nombre = nombre
  if (tipo !== undefined) updates.tipo = tipo
  if (prefijo !== undefined) updates.prefijo = prefijo.toUpperCase()
  if (descripcion !== undefined) updates.descripcion = descripcion
  if (orden !== undefined) updates.orden = orden
  if (activa !== undefined) updates.activa = activa
  const { data, error } = await supabase
    .from('zonas').update(updates).eq('id', id).eq('local_id', rid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const { error } = await supabase.from('zonas').delete().eq('id', id).eq('local_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
