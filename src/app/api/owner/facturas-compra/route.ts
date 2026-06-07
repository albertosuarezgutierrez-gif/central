export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET  /api/owner/facturas-compra  → listar facturas recibidas de proveedores
 * POST /api/owner/facturas-compra  → subir factura manualmente (operario)
 */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const match = req.nextUrl.searchParams.get('match')

  let q = supabase
    .from('facturas_compra')
    .select('*, ordenes_pago_proveedor(estado, importe, fecha_vencimiento, metodo)')
    .eq('local_id', rid)
    .order('created_at', { ascending: false })
    .limit(50)

  if (match) q = q.eq('match_estado', match)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stats
  const total = data ?? []
  const stats = {
    total:           total.length,
    ok:              total.filter(f => f.match_estado === 'ok').length,
    diferencia_leve: total.filter(f => f.match_estado === 'diferencia_leve').length,
    diferencia_grave:total.filter(f => f.match_estado === 'diferencia_grave').length,
    pendiente:       total.filter(f => f.match_estado === 'pendiente').length,
    sin_referencia:  total.filter(f => f.match_estado === 'sin_referencia').length,
  }

  return NextResponse.json({ facturas: data ?? [], stats })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const {
    recepcion_id, orden_pago_id, proveedor_nombre,
    numero_factura, fecha_factura, importe_total, importe_base,
    importe_iva, tipo_iva, lineas, notas
  } = await req.json()

  if (!proveedor_nombre || !importe_total) {
    return NextResponse.json({ error: 'proveedor_nombre e importe_total requeridos' }, { status: 400 })
  }

  // Validación 3 vías si hay orden de pago
  let matchEstado = 'sin_referencia'
  let matchDetalle: Record<string, unknown> = {}

  if (orden_pago_id) {
    const { data: orden } = await supabase
      .from('ordenes_pago_proveedor')
      .select('importe')
      .eq('id', orden_pago_id)
      .eq('local_id', rid)
      .single()

    if (orden) {
      const importeOrden = Number(orden.importe)
      const diff = Math.abs(Number(importe_total) - importeOrden)
      const diffPct = importeOrden > 0 ? diff / importeOrden : 1
      matchEstado  = diffPct <= 0.01 ? 'ok' : diffPct <= 0.05 ? 'diferencia_leve' : 'diferencia_grave'
      matchDetalle = {
        importe_factura: Number(importe_total),
        importe_orden:   importeOrden,
        diferencia_eur:  (Number(importe_total) - importeOrden).toFixed(2),
        diferencia_pct:  (diffPct * 100).toFixed(2) + '%',
      }

      if (matchEstado === 'ok') {
        await supabase
          .from('ordenes_pago_proveedor')
          .update({ estado: 'aprobado', match_estado: 'ok', aprobado_at: new Date().toISOString() })
          .eq('id', orden_pago_id)
      }
    }
  }

  const { data, error } = await supabase
    .from('facturas_compra')
    .insert({
      local_id: rid, recepcion_id: recepcion_id ?? null,
      orden_pago_id: orden_pago_id ?? null, proveedor_nombre,
      numero_factura: numero_factura ?? null, fecha_factura: fecha_factura ?? null,
      importe_total: Number(importe_total), importe_base: importe_base ?? null,
      importe_iva: importe_iva ?? null, tipo_iva: tipo_iva ?? null,
      lineas: lineas ?? [], match_estado: matchEstado, match_detalle: matchDetalle,
      subida_por: 'operario', notas: notas ?? null,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, factura: data, match_estado: matchEstado, match_detalle: matchDetalle })
}
