import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  try {
    const { lead_id, token } = await req.json()

    if (!lead_id || !token) {
      return NextResponse.json({ error: 'Parámetros requeridos' }, { status: 400 })
    }

    // Update click timestamp
    const { error } = await supabase
      .from('leads_web_tracking')
      .update({
        web_click_at: new Date().toISOString(),
        estado: 'clickeado'
      })
      .eq('lead_id', lead_id)

    if (error) {
      console.error('Error actualizando click:', error)
      return NextResponse.json({ error: 'Error al registrar click' }, { status: 500 })
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
