// ============================================================
// GET  /api/owner/restaurante — leer configuración del restaurante
// PATCH /api/owner/restaurante — actualizar NIF, razón social, dirección, etc.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const { data, error } = await supabase
    .from('restaurantes')
    .select('id, nombre, slug, nif, razon_social, direccion, ciudad, telefono, plan, activo, configuracion, onboarding_completado, logo_url, codigo_acceso')
    .eq('id', rid)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ restaurante: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const body = await req.json()

  // Solo campos editables por el owner — nunca id, plan, activo desde aquí
  const allowed = ['nombre', 'nif', 'razon_social', 'direccion', 'ciudad', 'telefono', 'configuracion', 'onboarding_completado']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('restaurantes')
    .update(updates)
    .eq('id', rid)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ restaurante: data })
}
