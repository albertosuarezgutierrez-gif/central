export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// Fix #7: usar getSession de @/lib/session (patrón crítico del proyecto)

function getIP(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : 'unknown'
}

// POST /api/turnos/fichar → fichar entrada
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.id || !session?.restaurante_id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const supabase = createServerClient()
  const ip = getIP(req)

  const { data, error } = await supabase.rpc('fichar_entrada', {
    p_camarero_id:    session.id,
    p_restaurante_id: session.restaurante_id,
    p_ip:             ip,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const row = data?.[0]
  return NextResponse.json({
    turno_id:   row?.turno_id,
    ya_fichado: row?.ya_fichado ?? false,
    ok: true,
  })
}

// DELETE /api/turnos/fichar → fichar salida
export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session?.id || !session?.restaurante_id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const supabase = createServerClient()
  const ip = getIP(req)

  const { data, error } = await supabase.rpc('fichar_salida', {
    p_camarero_id:    session.id,
    p_restaurante_id: session.restaurante_id,
    p_ip:             ip,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const row = data?.[0]
  if (!row?.ok) return NextResponse.json({ error: 'No tienes turno activo' }, { status: 404 })

  return NextResponse.json({
    turno_id: row.turno_id,
    horas:    row.horas,
    ok: true,
  })
}
