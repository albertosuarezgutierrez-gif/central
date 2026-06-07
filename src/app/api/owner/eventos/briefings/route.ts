import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/owner/eventos/briefings
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')
  const comercial_id = searchParams.get('comercial_id')

  let query = supabase
    .from('evento_briefing')
    .select(`
      id, token, estado, cliente_nombre, cliente_email, cliente_telefono,
      respuestas, resumen_ia, menus_sugeridos,
      precio_estimado_min, precio_estimado_max, score_viabilidad, alertas_ia,
      completado_at, created_at, expires_at,
      comercial:personal!comercial_id(id, nombre),
      evento_id, sesion_menu_id
    `)
    .eq('local_id', restauranteId)
    .order('created_at', { ascending: false })

  if (estado) query = query.eq('estado', estado)
  if (comercial_id) query = query.eq('comercial_id', comercial_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ briefings: data })
}

// POST /api/owner/eventos/briefings — crear briefing (comercial)
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { comercial_id, cliente_nombre, cliente_email, cliente_telefono, dias_expiracion = 30 } = body

  const { data, error } = await supabase
    .from('evento_briefing')
    .insert({
      restaurante_id: restauranteId,
      comercial_id: comercial_id || session.id,
      cliente_nombre, cliente_email, cliente_telefono,
      expires_at: new Date(Date.now() + dias_expiracion * 86400000).toISOString()
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.iarest.es'}/evento/briefing/${data.token}`
  return NextResponse.json({ briefing: data, url })
}
