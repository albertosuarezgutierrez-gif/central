import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('evento_valoracion')
    .select('id, evento_id, cliente_email, nps, created_at, evento:eventos(cliente_nombre, fecha_evento, tipo)')
    .eq('token', token)
    .single()

  if (error) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ valoracion: data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServerClient()

  const body = await req.json()
  const { nps, comentario, aspectos } = body

  if (!nps || nps < 1 || nps > 10)
    return NextResponse.json({ error: 'NPS debe estar entre 1 y 10' }, { status: 400 })

  const { data: val } = await supabase
    .from('evento_valoracion')
    .select('id, local_id, evento_id, nps')
    .eq('token', token)
    .single()

  if (!val) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 })
  if (val.nps) return NextResponse.json({ error: 'Ya valorado' }, { status: 409 })

  await supabase.from('evento_valoracion')
    .update({ nps, comentario, aspectos })
    .eq('token', token)

  // Si NPS alto → solicitar reseña Google
  if (nps >= 9) {
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('google_review_url')
      .eq('id', val.local_id)
      .single()

    if (rest?.google_review_url) {
      await supabase.from('evento_valoracion')
        .update({ reseña_google_solicitada: true, reseña_google_at: new Date().toISOString() })
        .eq('token', token)
    }
  }

  // Alerta si NPS bajo
  if (nps <= 6) {
    await tgAlert(`⚠️ <b>NPS bajo en evento</b>\nNPS: ${nps}/10\nComentario: ${comentario || 'sin comentario'}`, 'aviso')
  }

  const google_url = nps >= 9 ? (await supabase.from('restaurantes').select('google_review_url').eq('id', val.local_id).single()).data?.google_review_url : null

  return NextResponse.json({ ok: true, mostrar_reseña: nps >= 9, google_url })
}
