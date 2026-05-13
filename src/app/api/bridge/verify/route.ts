import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/bridge/verify
// El wizard llama aquí para verificar el bridge token y obtener datos del restaurante
export async function POST(req: Request) {
  try {
    const { token } = await req.json()
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

    const supabase = createServerClient()

    // Buscar el token en bridge_tokens
    const { data: bt, error } = await supabase
      .from('bridge_tokens')
      .select('id, restaurante_id, activo, restaurantes(nombre)')
      .eq('token', token)
      .eq('activo', true)
      .single()

    if (error || !bt) {
      return NextResponse.json({ error: 'Token no válido o inactivo' }, { status: 401 })
    }

    const restaurante = bt.restaurantes as unknown as { nombre: string } | null

    return NextResponse.json({
      ok: true,
      restaurante_id: bt.restaurante_id,
      nombre: restaurante?.nombre || 'Mi restaurante',
    })
  } catch (e) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
