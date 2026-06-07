export const dynamic = 'force-dynamic'

// ============================================================
// GET  /api/comanda/[id]/ticket-alias  — Obtener alias de conceptos
// POST /api/comanda/[id]/ticket-alias  — Crear/actualizar alias
// Solo owner y jefe_sala pueden modificar
// Los totales NUNCA se tocan — solo nombres para el ticket impreso
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export const runtime = 'nodejs'

// ── GET ──────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: comanda_id } = await params
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)

  const { data, error } = await supabase
    .from('ticket_aliases')
    .select('*')
    .eq('comanda_id', comanda_id)
    .eq('local_id', restaurante_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alias: data ?? null })
}

// ── POST ─────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: comanda_id } = await params
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const session = getSession(req)

  // Solo owner y jefe_sala
  if (!session || !['owner', 'jefe_sala'].includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permisos — solo owner o jefe de sala' }, { status: 403 })
  }

  let body: { items: AliasItem[]; motivo?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const { items, motivo } = body
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items requeridos' }, { status: 400 })
  }

  // Validar que la comanda pertenece al restaurante
  const { data: comanda } = await supabase
    .from('comandas')
    .select('id, estado')
    .eq('id', comanda_id)
    .eq('local_id', restaurante_id)
    .single()

  if (!comanda) return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })

  // Obtener IP del request
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  // Upsert (INSERT o UPDATE si ya existe)
  const { data, error } = await supabase
    .from('ticket_aliases')
    .upsert({
      comanda_id,
      restaurante_id,
      creado_por: session.id,
      motivo: motivo ?? null,
      items,
      ip,
    }, { onConflict: 'comanda_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Registrar en audit log
  try {
    await supabase.from('comanda_audit_log').insert({
      comanda_id,
      restaurante_id,
      camarero_id: session.id,
      accion: 'ticket_alias_guardado',
      detalle: JSON.stringify({ motivo, num_items_modificados: items.filter(i => i.nombre_alias).length }),
    })
  } catch { /* audit no crítico */ }

  return NextResponse.json({ alias: data }, { status: 201 })
}

interface AliasItem {
  comanda_item_id: string
  nombre_original: string
  nombre_alias: string | null  // null = mostrar original
}
