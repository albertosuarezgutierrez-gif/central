import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// GET /api/bridge/secciones?token=XXX
// El wizard lo llama al llegar al paso de configurar impresoras
// para rellenar el <select> de sección con las secciones reales del restaurante

export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

    const supabase = createServerClient()

    // Verificar token y obtener restaurante_id
    const { data: bt, error: btErr } = await supabase
      .from('bridge_tokens')
      .select('restaurante_id, activo')
      .eq('token', token)
      .eq('activo', true)
      .single()

    if (btErr || !bt) {
      return NextResponse.json({ error: 'Token no válido' }, { status: 401 })
    }

    // Obtener secciones activas
    const { data: secciones } = await supabase
      .from('secciones_cocina')
      .select('id, nombre')
      .eq('restaurante_id', bt.restaurante_id)
      .eq('activa', true)
      .order('nombre')

    return NextResponse.json({ ok: true, secciones: secciones ?? [] })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
