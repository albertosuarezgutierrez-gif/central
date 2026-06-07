export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

/**
 * POST /api/bridge/cashlogy/result
 * Llamado por bridge-local.js cuando termina una operación Cashlogy.
 * Actualiza cashlogy_operaciones y cierra la comanda si el cobro fue OK.
 * Auth: x-bridge-token (igual que /api/print)
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-bridge-token')
  if (!token) return NextResponse.json({ error: 'Sin token' }, { status: 401 })

  const supabase = createServerClient()

  // Verificar token del bridge
  const { data: bt } = await supabase
    .from('bridge_tokens')
    .select('restaurante_id, activo')
    .eq('token', token)
    .eq('activo', true)
    .maybeSingle()

  if (!bt) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  const rid = bt.restaurante_id

  const body = await req.json()
  const {
    operacion_id,
    ok, estado, code,
    auto, change: cambio, manual, extra,
    error: errorMsg,
    raw_cmd, raw_resp,
  } = body

  if (!operacion_id)
    return NextResponse.json({ error: 'operacion_id requerido' }, { status: 400 })

  // Actualizar operación
  const { data: op } = await supabase
    .from('cashlogy_operaciones')
    .update({
      estado:           estado ?? (ok ? 'completado' : 'error'),
      importe_cobrado:  auto   ?? 0,
      cambio_devuelto:  cambio ?? 0,
      cobro_manual:     manual ?? 0,
      extra_pagado:     extra  ?? 0,
      error_msg:        errorMsg ?? null,
      raw_request:      raw_cmd  ?? null,
      raw_response:     raw_resp ?? null,
      completado_at:    new Date().toISOString(),
    })
    .eq('id', operacion_id)
    .eq('local_id', rid)
    .select('comanda_id, importe_solicitado, importe_cobrado')
    .single()

  // Si el cobro fue OK y hay comanda → registrar pago + cerrar comanda
  if (ok && op?.comanda_id && estado !== 'cancelado') {
    const importeEur = (op.importe_cobrado ?? auto ?? 0) / 100
    const cambioEur  = (cambio ?? 0) / 100

    await supabase.from('pagos').insert({
      restaurante_id: rid,
      comanda_id:     op.comanda_id,
      metodo:         'efectivo_cashlogy',
      importe:        importeEur,
      cambio:         cambioEur,
      referencia:     operacion_id,
    })

    // Cerrar comanda si el cobro fue completo (sin manual pendiente)
    if (!manual || manual === 0) {
      await supabase.from('comandas')
        .update({ estado: 'cerrada', cerrada_at: new Date().toISOString() })
        .eq('id', op.comanda_id)
        .eq('local_id', rid)
    }
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
