import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const dynamic = 'force-dynamic'

const ROLES_PERMITIDOS = ['owner', 'jefe_sala', 'super_admin']

// ── GET: listar todas las reglas del restaurante ──────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const { data, error } = await supabase
    .from('alerta_reglas')
    .select('id, restaurante_id, nombre, activa, condicion, umbral_minutos, objeto, mensaje, horario_desde, horario_hasta, dias_semana, zona_ids, destinatario_tipo, camarero_id, canal_vox, canal_push, canal_hub, escalar_a, escalar_minutos, prioridad, created_at, updated_at')
    .eq('restaurante_id', rid)
    .order('prioridad', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reglas: data ?? [] })
}

// ── POST: crear nueva regla ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || !ROLES_PERMITIDOS.includes(session.rol))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const body = await req.json()

  const {
    nombre, condicion, umbral_minutos, objeto,
    horario_desde, horario_hasta, dias_semana, zona_ids,
    destinatario_tipo, camarero_id,
    canal_vox, canal_push, canal_hub,
    mensaje, escalar_a, escalar_minutos, prioridad
  } = body

  if (!nombre?.trim())
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  if (!condicion)
    return NextResponse.json({ error: 'La condición es obligatoria' }, { status: 400 })
  if (!umbral_minutos || umbral_minutos < 1)
    return NextResponse.json({ error: 'El umbral debe ser mayor de 0 minutos' }, { status: 400 })

  const { data, error } = await supabase
    .from('alerta_reglas')
    .insert({
      restaurante_id: rid,
      nombre: nombre.trim(),
      activa: true,
      logica: 'AND',
      condicion,
      umbral_minutos,
      objeto: objeto ?? 'mesa',
      horario_desde: horario_desde ?? null,
      horario_hasta: horario_hasta ?? null,
      dias_semana: dias_semana ?? null,
      zona_ids: zona_ids ?? null,
      destinatario_tipo: destinatario_tipo ?? 'camarero_asignado',
      camarero_id: camarero_id ?? null,
      canal_vox: canal_vox ?? false,
      canal_push: canal_push ?? true,
      canal_hub: canal_hub ?? false,
      mensaje: mensaje ?? null,
      escalar_a: escalar_a ?? null,
      escalar_minutos: escalar_minutos ?? null,
      prioridad: prioridad ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regla: data }, { status: 201 })
}

// ── PUT: actualizar regla ─────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session || !ROLES_PERMITIDOS.includes(session.rol))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const body = await req.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const { data: existing } = await supabase
    .from('alerta_reglas').select('id').eq('id', id).eq('restaurante_id', rid).single()
  if (!existing) return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 })

  const { data, error } = await supabase
    .from('alerta_reglas')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurante_id', rid)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regla: data })
}

// ── DELETE: solo owner puede borrar ──────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'super_admin'].includes(session.rol))
    return NextResponse.json({ error: 'Solo el owner puede eliminar reglas' }, { status: 403 })

  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const { error } = await supabase
    .from('alerta_reglas')
    .delete()
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
