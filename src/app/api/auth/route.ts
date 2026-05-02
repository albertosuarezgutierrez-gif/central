import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { pin, restaurante_code } = await req.json()

  if (!pin || pin.length !== 4) {
    return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  // 1. Resolver restaurante desde subdominio, código o slug
  let restaurante_id: string | null = null
  let restaurante_nombre = ''

  if (restaurante_code) {
    const { data: rest, error: restError } = await supabase
      .rpc('resolve_restaurante', { p_slug_or_code: restaurante_code })

    if (restError || !rest || rest.length === 0) {
      return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }
    restaurante_id = rest[0].id
    restaurante_nombre = rest[0].nombre
  }

  // Si no se pasó código, usar el restaurante demo (modo single-tenant legacy)
  if (!restaurante_id) {
    restaurante_id = '00000000-0000-0000-0000-000000000001'
    restaurante_nombre = 'Restaurante Demo'
  }

  // 2. Verificar PIN dentro del restaurante
  const { data, error } = await supabase
    .rpc('login_pin', { p_restaurante_id: restaurante_id, p_pin: pin })

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }

  const cam = data[0]

  return NextResponse.json({
    camarero: {
      id: cam.camarero_id,
      nombre: cam.nombre,
      rol: cam.rol,
      restaurante_id: cam.restaurante_id,
      restaurante_nombre: cam.restaurante_nombre ?? restaurante_nombre,
    }
  })
}
