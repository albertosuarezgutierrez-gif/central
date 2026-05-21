export const dynamic = 'force-dynamic'

// GET  /api/super/restaurantes/[id]/cuenta → cuenta actual + lista de todas las cuentas
// PATCH /api/super/restaurantes/[id]/cuenta → asigna el restaurante a otra cuenta

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function getSession(req: NextRequest) {
  const h = req.headers.get('x-ia-session')
  if (!h) return null
  try { return JSON.parse(h) } catch { return null }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const sb = createServerClient()

  // Cuenta actual del restaurante
  const { data: rest } = await sb
    .from('restaurantes')
    .select('cuenta_id')
    .eq('id', id)
    .single()

  // Todas las cuentas con sus restaurantes
  const { data: cuentas } = await sb
    .from('cuentas')
    .select('id, nombre, pin_cuenta, estado')
    .order('nombre')

  // Número de restaurantes por cuenta
  const { data: counts } = await sb
    .from('restaurantes')
    .select('cuenta_id')
    .eq('activo', true)

  const countMap: Record<string, number> = {}
  for (const r of counts ?? []) {
    if (r.cuenta_id) countMap[r.cuenta_id] = (countMap[r.cuenta_id] ?? 0) + 1
  }

  return NextResponse.json({
    cuenta_id_actual: rest?.cuenta_id ?? null,
    cuentas: (cuentas ?? []).map(c => ({
      ...c,
      num_restaurantes: countMap[c.id] ?? 0,
    })),
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { cuenta_id } = await req.json()
  if (!cuenta_id) return NextResponse.json({ error: 'cuenta_id requerido' }, { status: 400 })

  const sb = createServerClient()

  // Verificar que la cuenta existe
  const { data: cuenta } = await sb.from('cuentas').select('id, nombre').eq('id', cuenta_id).single()
  if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

  // Actualizar restaurante
  const { error } = await sb
    .from('restaurantes')
    .update({ cuenta_id })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Actualizar también los camareros del restaurante para mantener consistencia
  await sb.from('personal').update({ cuenta_id }).eq('restaurante_id', id)

  return NextResponse.json({ ok: true, cuenta_nombre: cuenta.nombre })
}
