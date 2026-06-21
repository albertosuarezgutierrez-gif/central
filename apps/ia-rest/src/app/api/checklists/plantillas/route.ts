export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

interface TareaPlantilla {
  texto: string
  frecuencia: 'apertura' | 'turno' | 'cierre'
  requiere_foto: boolean
}

// GET — lista las plantillas del restaurante
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('checklist_plantillas')
    .select('id, restaurante_id, seccion, nombre, tareas, activa, created_at')
    .eq('restaurante_id', rid)
    .order('seccion', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plantillas: data ?? [] })
}

// POST — upsert (crear o editar) una plantilla
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { id, seccion, nombre, tareas, activa } = body as {
    id?: string
    seccion: string
    nombre?: string
    tareas?: TareaPlantilla[]
    activa?: boolean
  }

  if (!seccion) return NextResponse.json({ error: 'seccion requerida' }, { status: 400 })

  const fila = {
    restaurante_id: rid,
    seccion,
    nombre: nombre ?? null,
    tareas: Array.isArray(tareas) ? tareas : [],
    activa: activa ?? true,
  }

  if (id) {
    // Editar — solo dentro del restaurante (multi-tenant)
    const { data, error } = await supabase
      .from('checklist_plantillas')
      .update(fila)
      .eq('id', id)
      .eq('restaurante_id', rid)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ plantilla: data })
  }

  const { data, error } = await supabase
    .from('checklist_plantillas')
    .insert(fila)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plantilla: data })
}

// DELETE — borra una plantilla por ?id=
export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabase
    .from('checklist_plantillas')
    .delete()
    .eq('id', id)
    .eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
