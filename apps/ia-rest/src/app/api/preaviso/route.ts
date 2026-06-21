// ============================================================
// /api/preaviso — Preaviso de marcha cocina ⇄ sala
//
// POST  { comanda_id }                 → cocina crea el preaviso (gated, dedup, push)
// PATCH { preaviso_id, accion }        → sala confirma 'mesa_lista' | 'cancelar'
//
// Multi-tenant: todas las queries filtran por el restaurante de la sesión.
// El flag restaurantes.preaviso_activo gobierna todo (403 si está off).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSession, getRestauranteId } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { crearPreavisoParaComanda } from '@/lib/preaviso-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { comanda_id } = await req.json() as { comanda_id?: string }
  if (!comanda_id) return NextResponse.json({ error: 'comanda_id requerido' }, { status: 400 })

  // 1) Gate de configuración: si el dueño no lo activó, 403
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('preaviso_activo')
    .eq('id', restauranteId)
    .single()
  if (!rest?.preaviso_activo) {
    return NextResponse.json({ error: 'Preaviso desactivado' }, { status: 403 })
  }

  // 2) Crear el preaviso (snapshot + insert + push). Lógica compartida con el cron.
  const res = await crearPreavisoParaComanda({
    supabase,
    restauranteId,
    comandaId: comanda_id,
    emitidoPor: session.rol ?? 'cocina',
  })

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status ?? 500 })
  if (res.dedup) return NextResponse.json({ ok: true, dedup: true })
  return NextResponse.json({ ok: true, preaviso: res.preaviso })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { preaviso_id, accion } = await req.json() as {
    preaviso_id?: string
    accion?: 'mesa_lista' | 'cancelar'
  }
  if (!preaviso_id) return NextResponse.json({ error: 'preaviso_id requerido' }, { status: 400 })

  const nuevoEstado = accion === 'cancelar' ? 'cancelado' : 'mesa_lista'
  const patch: Record<string, unknown> = { estado: nuevoEstado }
  if (nuevoEstado === 'mesa_lista') {
    patch.mesa_lista_at = new Date().toISOString()
    patch.mesa_lista_por = session.camarero_id ?? null
  }

  const { data, error } = await supabase
    .from('preavisos')
    .update(patch)
    .eq('id', preaviso_id)
    .eq('restaurante_id', restauranteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // El UPDATE viaja por Realtime al canal kds-{restaurante_id} → cocina lo ve.
  return NextResponse.json({ ok: true, preaviso: data })
}
