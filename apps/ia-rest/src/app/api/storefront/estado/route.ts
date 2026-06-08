export const dynamic = 'force-dynamic'

// PATCH /api/storefront/estado
// El restaurante actualiza el estado de un pedido online
// Requiere sesión interna

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

const ESTADOS_VALIDOS = ['confirmado','en_cocina','listo','entregado','cancelado']
const FLUJO: Record<string, string[]> = {
  pendiente:  ['confirmado','cancelado'],
  confirmado: ['en_cocina','cancelado'],
  en_cocina:  ['listo','cancelado'],
  listo:      ['entregado','cancelado'],
  entregado:  [],
  cancelado:  [],
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { pedido_id, estado } = await req.json()
  if (!pedido_id || !ESTADOS_VALIDOS.includes(estado)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Cargar pedido y verificar que pertenece al restaurante
  const { data: pedido } = await supabase
    .from('pedidos_online')
    .select('id, estado, local_id')
    .eq('id', pedido_id)
    .eq('local_id', session.restaurante_id)
    .single()

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // Verificar transición válida
  const permitidos = FLUJO[pedido.estado] ?? []
  if (!permitidos.includes(estado)) {
    return NextResponse.json({
      error: `No se puede pasar de "${pedido.estado}" a "${estado}"`
    }, { status: 400 })
  }

  const { error } = await supabase
    .from('pedidos_online')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', pedido_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, estado })
}

// GET /api/storefront/estado?activos=1
// Lista pedidos online activos del restaurante
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { data: pedidos } = await supabase
    .from('pedidos_online')
    .select('id, numero, tipo, canal, estado, cliente_nombre, cliente_telefono, cliente_direccion, items, total, cobro, tiempo_recogida_min, created_at')
    .eq('local_id', session.restaurante_id)
    .not('estado', 'in', '("entregado","cancelado")')
    .order('created_at', { ascending: true })

  return NextResponse.json({ pedidos: pedidos ?? [] })
}
