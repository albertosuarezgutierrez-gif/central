export const dynamic = 'force-dynamic'

// GET  /api/owner/metodos-pago   → lista todos los métodos del restaurante (activos e inactivos)
// PUT  /api/owner/metodos-pago   → body: { id: string, activo: boolean } → actualiza uno
// Solo owner / super_admin

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export const runtime = 'nodejs'

const METODOS_DEFAULT = [
  { nombre: 'Efectivo',         tipo: 'efectivo',          icono: '💵', color: '#3F7D44', activo: true,  orden: 0 },
  { nombre: 'Tarjeta',          tipo: 'tarjeta',           icono: '💳', color: '#2B6A6E', activo: true,  orden: 1 },
  { nombre: 'Bizum',            tipo: 'bizum',             icono: '📱', color: '#1A3A5C', activo: true,  orden: 2 },
  { nombre: 'Invitación',       tipo: 'invitacion',        icono: '🎁', color: '#9A3B1E', activo: true,  orden: 3 },
  { nombre: 'Cuenta corriente', tipo: 'cuenta_corriente',  icono: '🏢', color: '#4A4038', activo: true,  orden: 4 },
  { nombre: 'Tarjeta (Stripe)', tipo: 'stripe',            icono: '💳', color: '#635BFF', activo: false, orden: 5 },
]

// ── Asegura que el restaurante tenga los 6 métodos sembrados ────────────────
async function seedMetodos(supabase: ReturnType<typeof createServerClient>, restauranteId: string) {
  const inserts = METODOS_DEFAULT.map(m => ({ ...m, local_id: restauranteId }))
  await supabase
    .from('metodos_pago')
    .upsert(inserts, { onConflict: 'restaurante_id,tipo', ignoreDuplicates: true })
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'super_admin'].includes(session.rol))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  // Seed si aún no existen
  await seedMetodos(supabase, rid)

  const { data, error } = await supabase
    .from('metodos_pago')
    .select('id, nombre, tipo, icono, color, activo, orden')
    .eq('local_id', rid)
    .order('orden')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ metodos: data ?? [] })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'super_admin'].includes(session.rol))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rid = getRestauranteId(req)
  const body = await req.json()

  const { id, activo } = body as { id?: string; activo?: boolean }

  if (!id || typeof activo !== 'boolean')
    return NextResponse.json({ error: 'id y activo son requeridos' }, { status: 400 })

  const supabase = createServerClient()

  // Verificar que el método pertenece a este restaurante
  const { data: check } = await supabase
    .from('metodos_pago')
    .select('id')
    .eq('id', id)
    .eq('local_id', rid)
    .single()

  if (!check)
    return NextResponse.json({ error: 'Método no encontrado' }, { status: 404 })

  const { error } = await supabase
    .from('metodos_pago')
    .update({ activo })
    .eq('id', id)
    .eq('local_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
