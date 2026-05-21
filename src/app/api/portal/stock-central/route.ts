import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// GET — listar stock central de la cuenta
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const cuentaId = session.cuenta_id
  if (!cuentaId) return NextResponse.json({ error: 'Sin cuenta' }, { status: 400 })

  const { data, error } = await supabase
    .from('stock_central')
    .select('*')
    .eq('cuenta_id', cuentaId)
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stock: data ?? [] })
}

// POST — crear artículo en stock central
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const cuentaId = session.cuenta_id
  if (!cuentaId) return NextResponse.json({ error: 'Sin cuenta' }, { status: 400 })

  const body = await req.json()
  const { nombre, unidad, cantidad_total, coste_unitario, stock_minimo, categoria, tipo_stock } = body
  if (!nombre?.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('stock_central')
    .insert({
      cuenta_id: cuentaId,
      nombre: nombre.trim(),
      unidad: unidad ?? 'ud',
      cantidad_total: cantidad_total ?? 0,
      cantidad_disponible: cantidad_total ?? 0,
      coste_unitario: coste_unitario ?? null,
      stock_minimo: stock_minimo ?? 0,
      categoria: categoria ?? null,
      tipo_stock: tipo_stock ?? 'propio',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ articulo: data })
}

// PATCH — actualizar cantidad / datos de artículo central
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const body = await req.json()
  const { id, ...campos } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('stock_central')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('cuenta_id', session.cuenta_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ articulo: data })
}
