// /api/qr/marketing-consent — El cliente autoriza recibir novedades/publicidad.
// Público (sin sesión de staff): se valida por la sesión QR activa.
// RGPD: consentimientos SEPARADOS (bar / ia.rest), con prueba (texto + fecha).
//
// POST { token, sesion_id, telefono, consiente_bar, consiente_iarest, texto }

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { formatWA } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await req.json().catch(() => ({}))
    const { sesion_id, telefono, consiente_bar, consiente_iarest, texto } = body

    if (!sesion_id || !telefono) {
      return NextResponse.json({ error: 'sesion_id y telefono requeridos' }, { status: 400 })
    }
    // Al menos un consentimiento debe ir marcado (si no, no hay nada que guardar).
    if (!consiente_bar && !consiente_iarest) {
      return NextResponse.json({ error: 'Sin consentimiento que registrar' }, { status: 400 })
    }

    const tel = formatWA(String(telefono))
    if (!tel) return NextResponse.json({ error: 'Teléfono no válido' }, { status: 400 })

    // Validar sesión QR activa → obtener restaurante.
    const { data: sesion } = await supabase
      .from('qr_sesiones_cliente')
      .select('id, local_id, estado')
      .eq('id', sesion_id)
      .eq('estado', 'activa')
      .maybeSingle()
    if (!sesion) return NextResponse.json({ error: 'Sesión no válida' }, { status: 403 })

    const ahora = new Date().toISOString()

    // ¿Existe ya consentimiento de este teléfono en este bar? → actualizar.
    const { data: existente } = await supabase
      .from('marketing_consentimientos')
      .select('id')
      .eq('local_id', sesion.local_id)
      .eq('telefono', tel)
      .maybeSingle()

    if (existente) {
      await supabase
        .from('marketing_consentimientos')
        .update({
          consiente_bar: !!consiente_bar,
          consiente_iarest: !!consiente_iarest,
          texto_consentimiento: texto || null,
          updated_at: ahora,
          // Re-consentir limpia una revocación previa del mismo responsable.
          revocado_bar_en: consiente_bar ? null : undefined,
          revocado_iarest_en: consiente_iarest ? null : undefined,
        })
        .eq('id', existente.id)
    } else {
      await supabase.from('marketing_consentimientos').insert({
        local_id: sesion.local_id,
        telefono: tel,
        consiente_bar: !!consiente_bar,
        consiente_iarest: !!consiente_iarest,
        texto_consentimiento: texto || null,
        origen: 'qr',
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
