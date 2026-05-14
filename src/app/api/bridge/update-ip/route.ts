import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/bridge/update-ip
// El bridge llama aquí cuando detecta que una impresora cambió de IP
// Autenticado con bridge token, identifica la impresora por MAC
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

    const { impresora_id, mac_address, new_ip } = await req.json()

    if (!new_ip) return NextResponse.json({ error: 'new_ip requerido' }, { status: 400 })

    // Buscar por impresora_id o por MAC si no se pasa id
    let query = supabase
      .from('impresoras')
      .update({ ip_address: new_ip, mac_address: mac_address ?? undefined })
      .eq('restaurante_id', bt.restaurante_id)

    if (impresora_id) {
      query = query.eq('id', impresora_id)
    } else if (mac_address) {
      query = query.eq('mac_address', mac_address)
    } else {
      return NextResponse.json({ error: 'Requiere impresora_id o mac_address' }, { status: 400 })
    }

    const { data, error } = await query.select('id, nombre, ip_address').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, impresora: data })
  } catch (e) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
