export const dynamic = 'force-dynamic'
// Tracking de apertura de propuestas enviadas por Telegram
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createServerClient()

  // Buscar el lead con este token de propuesta
  const { data: lead } = await supabase
    .from('leads')
    .select('id, nombre, restaurante, propuesta_url, propuesta_vista_at')
    .eq('propuesta_token', token)
    .maybeSingle()

  if (!lead) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Registrar primera apertura
  if (!lead.propuesta_vista_at) {
    await supabase
      .from('leads')
      .update({ propuesta_vista_at: new Date().toISOString() })
      .eq('id', lead.id)

    await tgAlert(
      `👁 <b>${lead.restaurante || lead.nombre}</b> ha abierto la propuesta`,
      'aviso'
    )
  }

  // Redirigir a la propuesta real
  const destino = lead.propuesta_url || '/'
  return NextResponse.redirect(new URL(destino, 'https://www.iarest.es'))
}
