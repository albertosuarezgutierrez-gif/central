export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/bridge/setup-regla
// El wizard crea o actualiza la regla de envío al registrar impresoras

export async function POST(req: Request) {
  try {
    const {
      token,
      impresora_id,
      seccion_ids,       // [] = todas las secciones
      tipos_ticket,      // ['comanda','cuenta','marchar','factura']
      es_fallback,
    } = await req.json()

    if (!token || !impresora_id) {
      return NextResponse.json({ error: 'token e impresora_id requeridos' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: bt, error: btErr } = await supabase
      .from('bridge_tokens')
      .select('restaurante_id, activo')
      .eq('token', token)
      .eq('activo', true)
      .single()

    if (btErr || !bt) {
      return NextResponse.json({ error: 'Token no válido' }, { status: 401 })
    }

    const rid = bt.restaurante_id
    const tiposTicket: string[] = Array.isArray(tipos_ticket) && tipos_ticket.length > 0
      ? tipos_ticket : ['comanda', 'cuenta']
    const seccionIds: string[] = Array.isArray(seccion_ids) ? seccion_ids : []

    // Buscar si ya existe una regla para esta impresora
    const { data: existente } = await supabase
      .from('reglas_envio')
      .select('id')
      .eq('restaurante_id', rid)
      .eq('destino_tipo', 'impresora')
      .eq('destino_ref', impresora_id)
      .maybeSingle()

    if (existente) {
      await supabase
        .from('reglas_envio')
        .update({
          seccion_ids:         seccionIds,
          seccion_id:          seccionIds.length === 1 ? seccionIds[0] : null,
          tipos_ticket:        tiposTicket,
          imprimir_al_marchar: tiposTicket.includes('marchar'),
          es_fallback:         es_fallback ?? false,
          activa:              true,
        })
        .eq('id', existente.id)

      return NextResponse.json({ ok: true, accion: 'actualizada', id: existente.id })
    }

    const { data: nueva, error: insErr } = await supabase
      .from('reglas_envio')
      .insert({
        restaurante_id:      rid,
        destino_tipo:        'impresora',
        destino_ref:         impresora_id,
        seccion_ids:         seccionIds,
        seccion_id:          seccionIds.length === 1 ? seccionIds[0] : null,
        zona_tipos:          [],
        producto_ids:        [],
        tipos_ticket:        tiposTicket,
        imprimir_al_marchar: tiposTicket.includes('marchar'),
        es_fallback:         es_fallback ?? false,
        prioridad:           es_fallback ? 1 : 5,
        activa:              true,
      })
      .select('id')
      .single()

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, accion: 'creada', id: nueva.id })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
