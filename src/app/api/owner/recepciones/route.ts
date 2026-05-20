import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET  /api/owner/recepciones?estado=borrador   → lista recepciones
 * POST /api/owner/recepciones                   → crear recepción + items
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const url = new URL(req.url)
  const estado = url.searchParams.get('estado')
  const limit  = Number(url.searchParams.get('limit') ?? 20)

  let q = supabase
    .from('recepciones_mercancia')
    .select(`
      id, estado, fecha_recepcion, albaran_numero, notas, total_importe,
      proveedores(nombre),
      recepcion_items(id, nombre_articulo, cantidad_pedida, cantidad_recibida, estado, precio_facturado)
    `)
    .eq('restaurante_id', rid)
    .order('fecha_recepcion', { ascending: false })
    .limit(limit)

  if (estado) q = q.eq('estado', estado)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recepciones: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { proveedor_id, pedido_proveedor_id, albaran_numero, notas, items } = await req.json()
  if (!items?.length) return NextResponse.json({ error: 'items requeridos' }, { status: 400 })

  const { data: rec, error: recErr } = await supabase
    .from('recepciones_mercancia')
    .insert({
      restaurante_id:       rid,
      proveedor_id:         proveedor_id ?? null,
      pedido_proveedor_id:  pedido_proveedor_id ?? null,
      albaran_numero:       albaran_numero?.trim() || null,
      notas:                notas?.trim() || null,
      recibido_por:         session.id ?? null,
      estado:               'borrador',
    })
    .select().single()

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  const rows = items.map((it: {
    stock_articulo_id?: string
    nombre_articulo: string
    cantidad_pedida?: number
    cantidad_recibida: number
    unidad?: string
    precio_pedido?: number
    precio_facturado?: number
    fecha_caducidad?: string
    estado?: string
  }) => ({
    recepcion_id:       rec.id,
    restaurante_id:     rid,
    stock_articulo_id:  it.stock_articulo_id ?? null,
    nombre_articulo:    it.nombre_articulo,
    cantidad_pedida:    it.cantidad_pedida ?? null,
    cantidad_recibida:  it.cantidad_recibida,
    unidad:             it.unidad ?? 'unidad',
    precio_pedido:      it.precio_pedido ?? null,
    precio_facturado:   it.precio_facturado ?? null,
    fecha_caducidad:    it.fecha_caducidad ?? null,
    estado:             it.estado ?? 'ok',
  }))

  const { error: itemsErr } = await supabase.from('recepcion_items').insert(rows)
  if (itemsErr) {
    await supabase.from('recepciones_mercancia').delete().eq('id', rec.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, recepcion_id: rec.id })
}
