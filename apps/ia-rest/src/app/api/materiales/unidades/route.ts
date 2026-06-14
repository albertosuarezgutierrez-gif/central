export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET    — lista unidades (filtro: material_id, activo)
// POST   — crea unidad serializada (auto-genera codigo_qr si no se pasa)
// PATCH  — actualiza estado/espacio/notas/garantia { id, ...campos }
// DELETE — soft-delete { id }

function generarQr(restauranteId: string): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `U-${restauranteId.slice(0, 8).toUpperCase()}-${ts}-${rand}`
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const url = new URL(req.url)

  let q = supabase
    .from('materiales_unidades')
    .select('id, material_id, codigo_serie, codigo_qr, estado, espacio_actual_id, fecha_compra, garantia_hasta, precio_compra, vida_util_anios, notas, activo, created_at, material:materiales(nombre, categoria)')
    .eq('restaurante_id', rid)
    .order('created_at', { ascending: false })

  const materialId = url.searchParams.get('material_id')
  const soloActivos = url.searchParams.get('activo') !== 'false'
  if (materialId) q = q.eq('material_id', materialId)
  if (soloActivos) q = q.eq('activo', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ unidades: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  if (!body.material_id) return NextResponse.json({ error: 'material_id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('materiales_unidades')
    .insert({
      restaurante_id: rid,
      material_id: body.material_id,
      codigo_serie: body.codigo_serie ?? null,
      codigo_qr: body.codigo_qr?.trim() || generarQr(rid),
      estado: body.estado ?? 'operativo',
      espacio_actual_id: body.espacio_actual_id ?? null,
      fecha_compra: body.fecha_compra ?? null,
      garantia_hasta: body.garantia_hasta ?? null,
      precio_compra: body.precio_compra != null ? Number(body.precio_compra) : null,
      vida_util_anios: body.vida_util_anios != null ? Number(body.vida_util_anios) : null,
      notas: body.notas ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ unidad: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...campos } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['codigo_serie', 'estado', 'espacio_actual_id', 'fecha_compra', 'garantia_hasta', 'precio_compra', 'vida_util_anios', 'notas'] as const) {
    if (campos[k] !== undefined) updates[k] = campos[k]
  }

  const { error } = await supabase
    .from('materiales_unidades')
    .update(updates)
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabase
    .from('materiales_unidades')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
