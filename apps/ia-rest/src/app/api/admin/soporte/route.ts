// Puerto ADMIN → plataforma gestiona tickets de soporte con Bearer OPERADOR_SHARED_SECRET.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

const sb = () => createServerClient()

// GET /api/admin/soporte?estado=abierto|escalado|resuelto
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const estado = req.nextUrl.searchParams.get('estado')

  let q = sb()
    .from('soporte_tickets')
    .select(`
      id, asunto, estado, resuelto_por, created_at, updated_at, local_id,
      restaurantes(nombre)
    `)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (estado) q = q.eq('estado', estado)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tickets: data ?? [] })
}

// POST /api/admin/soporte — Alberto responde un ticket { ticket_id, texto }
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { ticket_id, texto } = await req.json()
  if (!ticket_id || !texto?.trim()) {
    return NextResponse.json({ error: 'ticket_id y texto requeridos' }, { status: 400 })
  }

  const { data: ticket } = await sb()
    .from('soporte_tickets')
    .select('local_id')
    .eq('id', ticket_id)
    .single()

  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  const { error } = await sb().from('soporte_mensajes').insert({
    ticket_id,
    local_id: ticket.local_id,
    rol: 'alberto',
    texto: texto.trim(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await sb().from('soporte_tickets')
    .update({ estado: 'abierto' })
    .eq('id', ticket_id)
    .eq('estado', 'escalado')

  return NextResponse.json({ ok: true })
}

// PATCH /api/admin/soporte — cambiar estado { ticket_id, estado }
export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { ticket_id, estado } = await req.json()
  if (!ticket_id || !estado) {
    return NextResponse.json({ error: 'ticket_id y estado requeridos' }, { status: 400 })
  }

  const { error } = await sb()
    .from('soporte_tickets')
    .update({ estado, resuelto_por: estado === 'resuelto' ? 'alberto' : undefined })
    .eq('id', ticket_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
