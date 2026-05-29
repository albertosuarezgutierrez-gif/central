import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  try {
    const { nombre, email, telefono, restaurante, locales, utm_id } = await req.json()

    if (!nombre || !email || !telefono || !restaurante || !utm_id) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      )
    }

    // Obtener lead para restaurante_id
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, restaurante_id, nombre')
      .eq('id', utm_id)
      .single()

    if (leadError || !lead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      )
    }

    // Actualizar tracking
    await supabase
      .from('leads_web_tracking')
      .update({
        formulario_rellenado_at: new Date().toISOString(),
        estado: 'formulario_rellenado'
      })
      .eq('lead_id', utm_id)

    // Insertar formulario
    const { error: insertError } = await supabase
      .from('formularios_demo_recibidos')
      .insert({
        lead_id: utm_id,
        restaurante_id: lead.restaurante_id,
        nombre,
        email,
        telefono,
        restaurante,
        locales,
        recibido_at: new Date().toISOString()
      })

    if (insertError) {
      console.error('Error insertando formulario:', insertError)
      return NextResponse.json(
        { error: 'Error al guardar formulario' },
        { status: 500 }
      )
    }

    // Telegram alert INMEDIATO
    await tgAlert(
      `<b>✅ FORMULARIO RELLENADO — ACCIÓN INMEDIATA</b>\n\n` +
      `<b>${nombre}</b>\n` +
      `📧 ${email}\n` +
      `☎️ ${telefono}\n` +
      `🏪 ${restaurante} (${locales} locales)\n\n` +
      `<a href="https://www.iarest.es/super?tab=leads&lead=${utm_id}">Ver en CRM</a>`,
      'info'
    )

    return NextResponse.json({ ok: true, formulario_id: utm_id })
  } catch (error) {
    console.error('Error en formulario-demo:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
