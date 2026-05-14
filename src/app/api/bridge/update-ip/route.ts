import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/bridge/update-ip
// El bridge llama aquí cuando una impresora cambió de IP (detectado por MAC)
export async function POST(req: Request) {
  try {
    const { token, impresora_id, new_ip } = await req.json()
    if (!token || !impresora_id || !new_ip) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Verificar token
    const { data: bt } = await supabase
      .from('bridge_tokens')
      .select('restaurante_id')
      .eq('token', token)
      .eq('activo', true)
      .single()

    if (!bt) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    // Verificar que la impresora pertenece al restaurante del token
    const { data: imp } = await supabase
      .from('impresoras')
      .select('id, nombre, ip_address, mac_address')
      .eq('id', impresora_id)
      .eq('restaurante_id', bt.restaurante_id)
      .single()

    if (!imp) return NextResponse.json({ error: 'Impresora no encontrada' }, { status: 404 })

    // Actualizar IP
    const { error } = await supabase
      .from('impresoras')
      .update({ ip_address: new_ip })
      .eq('id', impresora_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      nombre:  imp.nombre,
      old_ip:  imp.ip_address,
      new_ip,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
