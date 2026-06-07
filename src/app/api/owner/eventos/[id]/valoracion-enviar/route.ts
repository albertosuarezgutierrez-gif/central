import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { tgAlert } from '@/lib/telegram'

// POST — enviar link valoración al cliente
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data: evento } = await supabase
    .from('eventos')
    .select('cliente_nombre, cliente_email')
    .eq('id', id)
    .eq('local_id', restauranteId)
    .single()

  if (!evento?.cliente_email)
    return NextResponse.json({ error: 'El evento no tiene email de cliente' }, { status: 400 })

  // Crear o recuperar valoración
  let token: string | null = null
  const { data: existing } = await supabase
    .from('evento_valoracion')
    .select('token')
    .eq('evento_id', id)
    .maybeSingle()

  if (existing?.token) {
    token = existing.token
  } else {
    const { data: nueva } = await supabase
      .from('evento_valoracion')
      .insert({ local_id: restauranteId, evento_id: id, cliente_email: evento.cliente_email })
      .select('token')
      .single()
    token = nueva?.token || null
  }

  if (!token) return NextResponse.json({ error: 'Error generando token' }, { status: 500 })

  const url = `https://www.iarest.es/evento/valoracion/${token}`

  // Notificar operador (email se enviará con Resend cuando esté configurado)
  await tgAlert(
    `📧 <b>Valoración lista para ${evento.cliente_nombre}</b>\n${url}`,
    'info'
  )

  return NextResponse.json({ ok: true, token, url })
}
