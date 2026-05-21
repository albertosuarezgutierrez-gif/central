import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// GET — listar transferencias de la cuenta
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')

  let query = supabase
    .from('transferencias_stock')
    .select('*')
    .eq('cuenta_id', session.cuenta_id)
    .order('creado_at', { ascending: false })
    .limit(50)

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transferencias: data ?? [] })
}

// POST — crear transferencia (pedido de local al almacén central)
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const body = await req.json()
  const {
    origen_tipo, origen_id,
    destino_tipo, destino_id,
    articulo_nombre, articulo_ref,
    cantidad, unidad,
    coste_unitario, notas
  } = body

  if (!articulo_nombre || !cantidad || !destino_id) {
    return NextResponse.json({ error: 'articulo_nombre, cantidad y destino_id son requeridos' }, { status: 400 })
  }

  const importe_total = coste_unitario ? coste_unitario * cantidad : null

  const { data, error } = await supabase
    .from('transferencias_stock')
    .insert({
      cuenta_id: session.cuenta_id,
      origen_tipo: origen_tipo ?? 'central',
      origen_id: origen_id ?? null,
      destino_tipo: destino_tipo ?? 'restaurante',
      destino_id,
      articulo_nombre,
      articulo_ref: articulo_ref ?? null,
      cantidad,
      unidad: unidad ?? 'ud',
      coste_unitario: coste_unitario ?? null,
      importe_total,
      notas: notas ?? null,
      solicitado_por: session.camarero_id ?? null,
      estado: 'pendiente',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transferencia: data })
}

// PATCH — cambiar estado de transferencia (en_transito → recibido)
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const { id, estado } = await req.json()
  if (!id || !estado) return NextResponse.json({ error: 'id y estado requeridos' }, { status: 400 })

  const ahora = new Date().toISOString()
  const extra: Record<string, string> = {}
  if (estado === 'en_transito') extra.enviado_at = ahora
  if (estado === 'recibido')    extra.recibido_at = ahora
  if (estado === 'cancelado')   extra.cancelado_at = ahora

  const { data, error } = await supabase
    .from('transferencias_stock')
    .update({ estado, ...extra })
    .eq('id', id)
    .eq('cuenta_id', session.cuenta_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transferencia: data })
}
