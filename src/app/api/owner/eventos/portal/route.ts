import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST — crear portal para un evento
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { evento_id, mostrar_menu, mostrar_invitados, mostrar_timeline } = await req.json()
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  const { data: token } = await supabase.rpc('crear_portal_evento', { p_evento_id: evento_id })

  // Actualizar config de visibilidad
  if (mostrar_menu !== undefined || mostrar_invitados !== undefined || mostrar_timeline !== undefined) {
    await supabase.from('evento_portal_cliente').update({
      mostrar_menu: mostrar_menu ?? true,
      mostrar_invitados: mostrar_invitados ?? true,
      mostrar_timeline: mostrar_timeline ?? true,
    }).eq('evento_id', evento_id)
  }

  return NextResponse.json({
    token,
    url: `${process.env.NEXT_PUBLIC_URL ?? 'https://www.iarest.es'}/portal/${token}`,
  })
}

// GET — datos del portal (para el owner, ver config)
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  const { data, error } = await supabase.from('evento_portal_cliente')
    .select('*').eq('evento_id', evento_id).single()

  if (error) return NextResponse.json({ portal: null })
  return NextResponse.json({ portal: data, url: `https://www.iarest.es/portal/${data?.token}` })
}

// PUT — actualizar config visibilidad
export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const { evento_id, ...updates } = await req.json()
  await supabase.from('evento_portal_cliente').update(updates).eq('evento_id', evento_id)
  return NextResponse.json({ ok: true })
}
