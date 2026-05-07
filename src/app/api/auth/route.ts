import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pin, restaurante_code } = body

  if (!pin || String(pin).length !== 4) {
    return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  let restaurante_id = '00000000-0000-0000-0000-000000000001'
  let restaurante_nombre = 'Restaurante Demo'

  // Resolver restaurante por código si se proporciona
  if (restaurante_code && restaurante_code !== 'ia-rest') {
    const { data: rest } = await supabase
      .rpc('resolve_restaurante', { p_slug_or_code: restaurante_code })

    if (!rest || rest.length === 0) {
      return NextResponse.json({ error: `Restaurante "${restaurante_code}" no encontrado` }, { status: 404 })
    }
    restaurante_id = rest[0].id
    restaurante_nombre = rest[0].nombre
  }

  // Verificar PIN dentro del restaurante usando RPC
  const { data, error } = await supabase
    .rpc('login_pin', { p_restaurante_id: restaurante_id, p_pin: String(pin) })

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }

  const cam = data[0]

  // Leer onboarding_completado para owners nuevos
  let onboarding_completado: boolean | null = null
  if (cam.rol === 'owner' || cam.rol === 'super_admin') {
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('onboarding_completado')
      .eq('id', cam.restaurante_id)
      .single()
    onboarding_completado = rest?.onboarding_completado ?? false
  }

  return NextResponse.json({
    camarero: {
      id: cam.camarero_id,
      nombre: cam.nombre,
      rol: cam.rol,
      restaurante_id: cam.restaurante_id,
      restaurante_nombre: cam.restaurante_nombre ?? restaurante_nombre,
      seccion_id: cam.seccion_id ?? null,
      onboarding_completado,
    }
  })
}
