// /api/qr/avisar — El CLIENTE QR pide que le avisen cuando su pedido esté listo.
// Público (sin sesión de staff): se valida por la sesión QR + la comanda.
// Registra un canal de aviso server-side (web_push o whatsapp) para esa comanda.
//
// POST { token, sesion_id, comanda_id, canal?, subscription?, destino? }

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await req.json().catch(() => ({}))
    const { token, sesion_id, comanda_id, canal = 'web_push', subscription, destino } = body

    if (!sesion_id || !comanda_id) {
      return NextResponse.json({ error: 'sesion_id y comanda_id requeridos' }, { status: 400 })
    }
    if (canal === 'web_push' && !subscription) {
      return NextResponse.json({ error: 'subscription requerida' }, { status: 400 })
    }
    if (canal === 'whatsapp' && !destino) {
      return NextResponse.json({ error: 'destino (teléfono) requerido' }, { status: 400 })
    }

    // Validar que la sesión QR existe y está activa.
    const { data: sesion } = await supabase
      .from('qr_sesiones_cliente')
      .select('id, mesa_id, restaurante_id, estado')
      .eq('id', sesion_id)
      .eq('estado', 'activa')
      .maybeSingle()
    if (!sesion) return NextResponse.json({ error: 'Sesión no válida' }, { status: 403 })

    // Validar que la comanda pertenece a la misma mesa/restaurante (anti-spoofing).
    const { data: comanda } = await supabase
      .from('comandas')
      .select('id, mesa_id, restaurante_id, estado')
      .eq('id', comanda_id)
      .maybeSingle()
    if (!comanda || comanda.mesa_id !== sesion.mesa_id || comanda.restaurante_id !== sesion.restaurante_id) {
      return NextResponse.json({ error: 'Comanda no coincide con la sesión' }, { status: 403 })
    }

    // Si ya está lista, no hace falta registrar: el cliente ya debería verlo.
    if (['lista', 'entregada', 'cerrada'].includes(comanda.estado)) {
      return NextResponse.json({ ok: true, ya_lista: true })
    }

    const subStr = subscription ? JSON.stringify(subscription) : null

    // Evitar duplicados: borrar avisos no notificados del mismo canal/endpoint para esta comanda.
    let dq = supabase
      .from('qr_avisos_suscripciones')
      .delete()
      .eq('comanda_id', comanda_id)
      .eq('canal', canal)
      .eq('notificado', false)
    if (subStr) dq = dq.eq('subscription', subStr)
    if (destino) dq = dq.eq('destino', destino)
    await dq

    const { error } = await supabase.from('qr_avisos_suscripciones').insert({
      local_id: sesion.restaurante_id,
      sesion_id: sesion.id,
      comanda_id,
      mesa_id: sesion.mesa_id,
      token: token || null,
      canal,
      subscription: subStr,
      destino: destino || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
