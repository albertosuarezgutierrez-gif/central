// src/app/api/super/soporte/route.ts
// GET  — todos los tickets de soporte (con filtros opcionales)
// POST { ticket_id, texto } — Alberto responde en un ticket
// PATCH { ticket_id, estado } — Alberto cierra o reabre un ticket

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

const sb = () => createServerClient()

function esSuper(req: NextRequest): boolean {
  const session = getSession(req)
  return session?.rol === 'super_admin'
}

export async function GET(req: NextRequest) {
  if (!esSuper(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const estado = req.nextUrl.searchParams.get('estado') // 'abierto'|'escalado'|'resuelto'|null

  let q = sb()
    .from('soporte_tickets')
    .select(`
      id, asunto, estado, resuelto_por, created_at, updated_at, restaurante_id,
      restaurantes(nombre)
    `)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (estado) q = q.eq('estado', estado)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tickets: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!esSuper(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { ticket_id, texto } = await req.json()
  if (!ticket_id || !texto?.trim()) {
    return NextResponse.json({ error: 'ticket_id y texto requeridos' }, { status: 400 })
  }

  // Obtener restaurante_id del ticket
  const { data: ticket } = await sb()
    .from('soporte_tickets')
    .select('restaurante_id')
    .eq('id', ticket_id)
    .single()

  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  // Insertar respuesta de Alberto
  const { error } = await sb().from('soporte_mensajes').insert({
    ticket_id,
    restaurante_id: ticket.restaurante_id,
    rol: 'alberto',
    texto: texto.trim(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marcar ticket como abierto si estaba escalado (Alberto está atendiendo)
  await sb().from('soporte_tickets')
    .update({ estado: 'abierto' })
    .eq('id', ticket_id)
    .eq('estado', 'escalado')

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  if (!esSuper(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

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
