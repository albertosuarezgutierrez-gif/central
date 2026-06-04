import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  try {
    const { lead_id } = await req.json()
    if (!lead_id) {
      return NextResponse.json({ error: 'Parámetros requeridos' }, { status: 400 })
    }

    // ¿Es el primer clic? (para no spamear Telegram en recargas/reaperturas)
    const { data: tracks } = await supabase
      .from('leads_web_tracking')
      .select('web_click_at')
      .eq('lead_id', lead_id)
    const yaClickeado = (tracks || []).some((t) => t.web_click_at)

    const { error } = await supabase
      .from('leads_web_tracking')
      .update({ web_click_at: new Date().toISOString(), estado: 'clickeado' })
      .eq('lead_id', lead_id)

    if (error) {
      console.error('Error actualizando click:', error)
      return NextResponse.json({ error: 'Error al registrar click' }, { status: 500 })
    }

    // Aviso al operador solo la primera vez que este lead entra desde el email.
    if (!yaClickeado) {
      const { data: lead } = await supabase
        .from('leads')
        .select('nombre, empresa, restaurante, tipo_negocio')
        .eq('id', lead_id)
        .maybeSingle()
      const quien = lead?.empresa || lead?.nombre || lead?.restaurante || 'Un lead'
      const vert =
        lead?.tipo_negocio === 'catering' ? 'catering'
        : lead?.tipo_negocio === 'eventos' ? 'eventos/haciendas'
        : 'restaurante'
      await tgAlert(
        `👀 ${quien} ha entrado en la web desde el email de venta (${vert}). Está interesado — buen momento para llamar o escribir.`,
        'aviso'
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error en track-click:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
