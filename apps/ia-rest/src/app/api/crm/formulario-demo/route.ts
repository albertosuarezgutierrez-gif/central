import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  try {
    const { nombre, email, telefono, restaurante, locales, utm_id } = await req.json()

    if (!nombre || !email || !telefono || !restaurante || !utm_id) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    // Verificar lead existe
    const { data: lead } = await supabase
      .from('leads')
      .select('id, nombre')
      .eq('id', utm_id)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
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
      .insert({ lead_id: utm_id, nombre, email, telefono, restaurante, locales })

    if (insertError) throw new Error(insertError.message)

    // Telegram INMEDIATO
    await tgAlert(
      `<b>✅ FORMULARIO RELLENADO — LLAMAR YA</b>\n\n` +
      `<b>${nombre}</b>\n` +
      `📧 ${email}\n` +
      `☎️ ${telefono}\n` +
      `🏪 ${restaurante} (${locales} locales)\n\n` +
      `<a href="https://www.iarest.es/super?tab=leads&lead=${utm_id}">Ver en CRM</a>`,
      'info'
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error formulario-demo:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 }
    )
  }
}
