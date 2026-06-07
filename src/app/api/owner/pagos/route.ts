export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET  /api/owner/pagos              → listar órdenes de pago (con filtros)
 * POST /api/owner/pagos              → crear orden de pago manual
 * PATCH /api/owner/pagos             → actualizar estado (aprobar, cancelar, marcar pagado)
 */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const estado = req.nextUrl.searchParams.get('estado')
  const metodo = req.nextUrl.searchParams.get('metodo')

  let q = supabase
    .from('ordenes_pago_proveedor')
    .select('*')
    .eq('local_id', rid)
    .order('fecha_vencimiento', { ascending: true })

  if (estado) q = q.eq('estado', estado)
  if (metodo) q = q.eq('metodo', metodo)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Totales por estado
  const pendiente = (data ?? []).filter(o => o.estado === 'pendiente').reduce((s, o) => s + Number(o.importe), 0)
  const aprobado  = (data ?? []).filter(o => o.estado === 'aprobado').reduce((s, o) => s + Number(o.importe), 0)

  return NextResponse.json({
    ordenes: data ?? [],
    totales: { pendiente, aprobado, total: pendiente + aprobado }
  })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const {
    proveedor_id, recepcion_id, proveedor_nombre,
    concepto, importe, fecha_vencimiento, metodo = 'sepa', notas
  } = await req.json()

  if (!proveedor_nombre || !importe || !fecha_vencimiento) {
    return NextResponse.json({ error: 'proveedor_nombre, importe y fecha_vencimiento requeridos' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('ordenes_pago_proveedor')
    .insert({
      local_id:   rid,
      proveedor_id:     proveedor_id ?? null,
      recepcion_id:     recepcion_id ?? null,
      proveedor_nombre,
      concepto:         concepto ?? `Pago a ${proveedor_nombre}`,
      importe:          Number(importe),
      fecha_vencimiento,
      metodo,
      notas:            notas ?? null,
      estado:           'pendiente',
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, orden: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { id, accion, notas } = await req.json()
  if (!id || !accion) return NextResponse.json({ error: 'id y accion requeridos' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (accion === 'aprobar') {
    updates.estado = 'aprobado'
    updates.aprobado_at = new Date().toISOString()
    updates.aprobado_por = session.id ?? null
  } else if (accion === 'cancelar') {
    updates.estado = 'cancelado'
    updates.notas = notas ?? null
  } else if (accion === 'marcar_pagado') {
    updates.estado = 'pagado_manual'
    updates.pagado_at = new Date().toISOString()
    updates.notas = notas ?? null
  } else {
    return NextResponse.json({ error: 'accion desconocida' }, { status: 400 })
  }

  const { error } = await supabase
    .from('ordenes_pago_proveedor')
    .update(updates)
    .eq('id', id)
    .eq('local_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
