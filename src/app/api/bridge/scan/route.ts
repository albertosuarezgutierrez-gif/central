export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

// POST /api/bridge/scan — owner solicita escaneo de red
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'admin', 'super_admin', 'jefe_sala'].includes(session.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { data: bt } = await supabase
    .from('bridge_tokens')
    .select('id')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .single()

  if (!bt) return NextResponse.json({ error: 'No hay bridge configurado.' }, { status: 404 })

  // Limpiar resultados anteriores + marcar scan_requested
  await supabase
    .from('bridge_tokens')
    .update({ scan_requested: true, scan_results: [] })
    .eq('id', bt.id)

  return NextResponse.json({ ok: true })
}

// GET /api/bridge/scan — owner consulta resultados del escaneo
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'admin', 'super_admin', 'jefe_sala'].includes(session.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { data: bt } = await supabase
    .from('bridge_tokens')
    .select('scan_results, scan_requested')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .single()

  return NextResponse.json({
    results: (bt?.scan_results as { ip: string; port: number; ms: number }[]) ?? [],
    scanning: bt?.scan_requested === true,
  })
}

// PATCH /api/bridge/scan — bridge reporta resultados del escaneo
export async function PATCH(req: NextRequest) {
  const token = req.headers.get('x-bridge-token')
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 401 })

  const supabase = createServerClient()
  const { data: bt } = await supabase
    .from('bridge_tokens')
    .select('id')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (!bt) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const results = body.results ?? []

  await supabase
    .from('bridge_tokens')
    .update({ scan_results: results, scan_requested: false })
    .eq('id', bt.id)

  return NextResponse.json({ ok: true, found: results.length })
}
