export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/bridge/register-printer
export async function POST(req: Request) {
  try {
    const token = req.headers.get('x-bridge-token')
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 401 })

    const supabase = createServerClient()

    const { data: bt } = await supabase
      .from('bridge_tokens')
      .select('restaurante_id')
      .eq('token', token)
      .eq('activo', true)
      .single()

    if (!bt) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { ip_address, port, nombre, connection_type, seccion_id, mac_address, modelo, fabricante, perfil_escpos } = await req.json()

    if (!ip_address) return NextResponse.json({ error: 'IP requerida' }, { status: 400 })

    // Buscar existente por MAC primero (más fiable), luego por IP
    let existing: { id: string } | null = null
    if (mac_address) {
      const { data } = await supabase
        .from('impresoras')
        .select('id')
        .eq('restaurante_id', bt.restaurante_id)
        .eq('mac_address', mac_address)
        .single()
      existing = data
    }
    if (!existing) {
      const { data } = await supabase
        .from('impresoras')
        .select('id')
        .eq('restaurante_id', bt.restaurante_id)
        .eq('ip_address', ip_address)
        .single()
      existing = data
    }

    const fields = {
      nombre:          nombre || `Impresora ${ip_address}`,
        modelo:          modelo ?? null,
        fabricante:      fabricante ?? null,
        perfil_escpos:   perfil_escpos ?? 'generico',
      port:            port || 9100,
      connection_type: connection_type || 'ip_local',
      seccion_id:      seccion_id || null,
      secciones_ids:   seccion_id ? [seccion_id] : [],
      activa:          true,
      configurada:     true,
      ip_address,
      ...(mac_address ? { mac_address } : {}),
    }

    let result
    if (existing) {
      result = await supabase.from('impresoras').update(fields).eq('id', existing.id).select('id').single()
    } else {
      result = await supabase.from('impresoras').insert({ restaurante_id: bt.restaurante_id, ...fields }).select('id').single()
    }

    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: result.data?.id })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
