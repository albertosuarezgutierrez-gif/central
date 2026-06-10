// Puerto del OPERADOR (god-panel de la matriz). Read-only + bloquear/liberar de
// los restaurantes (tenants de ia-rest). Server-to-server: lo llama apps/plataforma
// con `Authorization: Bearer <OPERADOR_SHARED_SECRET>`. Additivo, no toca el resto.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// GET /api/operador/restaurantes — lista los tenants con métricas para el panel.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('restaurantes')
    .select(`
      id, nombre, ciudad, plan, plan_status, activo, created_at,
      personal!local_id(count),
      mesas:mesas(count),
      comandas:comandas(count)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const restaurantes = (data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    ciudad: r.ciudad ?? null,
    plan: r.plan ?? null,
    plan_status: r.plan_status ?? null,
    activo: r.activo !== false,
    created_at: r.created_at,
    num_camareros: r['personal']?.[0]?.count ?? 0,
    num_mesas: r.mesas?.[0]?.count ?? 0,
    num_comandas: r.comandas?.[0]?.count ?? 0,
  }))

  return NextResponse.json({ restaurantes })
}

// POST /api/operador/restaurantes { nombre, ciudad? } — alta de tenant desde el panel.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { nombre, ciudad } = await req.json().catch(() => ({}))
  if (!nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  const slug = String(nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `rest-${Date.now()}`
  const codigo = Math.random().toString(36).slice(2, 8).toUpperCase()

  const supabase = createServerClient()
  const { data: rest, error } = await supabase
    .from('restaurantes')
    .insert({ nombre, slug, codigo_acceso: codigo, plan: 'starter', ciudad: ciudad || 'Madrid' })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Camarero admin por defecto (PIN 0000), igual que /api/super/restaurantes.
  await supabase.from('personal').insert({ nombre: 'Admin', pin: '0000', rol: 'jefe_sala', local_id: rest.id, activo: true })

  return NextResponse.json({ id: rest.id }, { status: 201 })
}

// PATCH /api/operador/restaurantes { id, activo } — bloquear/liberar un tenant.
export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, activo } = await req.json().catch(() => ({}))
  if (!id || typeof activo !== 'boolean') {
    return NextResponse.json({ error: 'id y activo (boolean) requeridos' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('restaurantes')
    .update({ activo, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
