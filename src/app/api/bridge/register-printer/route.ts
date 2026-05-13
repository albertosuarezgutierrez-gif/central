import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/bridge/register-printer
// El wizard llama aquí para registrar cada impresora detectada en la red
export async function POST(req: Request) {
  try {
    const token = req.headers.get('x-bridge-token')
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 401 })

    const supabase = createServerClient()

    // Verificar token
    const { data: bt, error: btErr } = await supabase
      .from('bridge_tokens')
      .select('restaurante_id')
      .eq('token', token)
      .eq('activo', true)
      .single()

    if (btErr || !bt) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { ip_address, port, nombre, connection_type, seccion_id } = await req.json()

    if (!ip_address) return NextResponse.json({ error: 'IP requerida' }, { status: 400 })

    // Verificar si ya existe impresora con esa IP en ese restaurante
    const { data: existing } = await supabase
      .from('impresoras')
      .select('id')
      .eq('restaurante_id', bt.restaurante_id)
      .eq('ip_address', ip_address)
      .single()

    let result
    if (existing) {
      // Actualizar la existente
      result = await supabase
        .from('impresoras')
        .update({
          nombre:          nombre || `Impresora ${ip_address}`,
          port:            port || 9100,
          connection_type: connection_type || 'ip_local',
          seccion_id:      seccion_id || null,
          secciones_ids:   seccion_id ? [seccion_id] : [],
          activa:          true,
          configurada:     true,
        })
        .eq('id', existing.id)
        .select('id')
        .single()
    } else {
      // Insertar nueva
      result = await supabase
        .from('impresoras')
        .insert({
          restaurante_id:  bt.restaurante_id,
          nombre:          nombre || `Impresora ${ip_address}`,
          ip_address,
          port:            port || 9100,
          connection_type: connection_type || 'ip_local',
          seccion_id:      seccion_id || null,
          secciones_ids:   seccion_id ? [seccion_id] : [],
          activa:          true,
          configurada:     true,
        })
        .select('id')
        .single()
    }

    const { data, error } = result

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, id: data?.id })
  } catch (e) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
