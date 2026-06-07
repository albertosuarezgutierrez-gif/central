export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/bridge/update-ip
// El bridge llama aquí cuando detecta que una impresora cambió de IP por DHCP
// Identifica la impresora por mac_address o impresora_id
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

    const body = await req.json()
    const { impresora_id, mac_address, new_ip } = body

    if (!new_ip) {
      return NextResponse.json({ error: 'new_ip requerido' }, { status: 400 })
    }
    if (!impresora_id && !mac_address) {
      return NextResponse.json({ error: 'Requiere impresora_id o mac_address' }, { status: 400 })
    }

    const updates: Record<string, string> = { ip_address: new_ip }
    if (mac_address) updates.mac_address = mac_address

    // Actualizar por ID
    if (impresora_id) {
      const { data, error } = await supabase
        .from('impresoras')
        .update(updates)
        .eq('id', impresora_id)
        .eq('local_id', bt.restaurante_id)
        .select('id, nombre, ip_address')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, impresora: data })
    }

    // Actualizar por MAC
    const { data, error } = await supabase
      .from('impresoras')
      .update(updates)
      .eq('mac_address', mac_address)
      .eq('local_id', bt.restaurante_id)
      .select('id, nombre, ip_address')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, impresora: data })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
