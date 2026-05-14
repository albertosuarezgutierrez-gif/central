import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/bridge/register-printer
export async function POST(req: Request) {
  try {
    const token = req.headers.get('x-bridge-token')
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 401 })

    const supabase = createServerClient()

    const { data: bt, error: btErr } = await supabase
      .from('bridge_tokens')
      .select('restaurante_id')
      .eq('token', token)
      .eq('activo', true)
      .single()

    if (btErr || !bt) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { ip_address, port, nombre, connection_type, seccion_id, mac_address } = await req.json()
    if (!ip_address) return NextResponse.json({ error: 'IP requerida' }, { status: 400 })

    const macNorm = mac_address ? mac_address.replace(/-/g, ':').toLowerCase() : null

    // Buscar existente por MAC (más fiable que por IP)
    let existing: { id: string } | null = null

    if (macNorm) {
      const { data } = await supabase
        .from('impresoras')
        .select('id')
        .eq('restaurante_id', bt.restaurante_id)
        .eq('mac_address', macNorm)
        .single()
      existing = data
    }

    // Fallback: buscar por IP si no hay MAC
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
      ip_address,
      port:            port || 9100,
      connection_type: connection_type || 'ip_local',
      seccion_id:      seccion_id || null,
      secciones_ids:   seccion_id ? [seccion_id] : [],
      activa:          true,
      configurada:     true,
      ...(macNorm ? { mac_address: macNorm } : {}),
    }

    let result
    if (existing) {
      result = await supabase
        .from('impresoras').update(fields)
        .eq('id', existing.id).select('id').single()
    } else {
      result = await supabase
        .from('impresoras').insert({ restaurante_id: bt.restaurante_id, ...fields })
        .select('id').single()
    }

    const { data, error } = result
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data?.id })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
