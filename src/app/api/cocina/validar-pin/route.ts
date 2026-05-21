export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/cocina/validar-pin
// Valida PIN de cocinero — solo acepta rol 'cocina'
// Body: { pin: string, restaurante_code: string }
// Response: { camarero: { id, nombre, rol, restaurante_id } } | { error }

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pin, restaurante_code } = body

  if (!pin || String(pin).length !== 4) {
    return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })
  }
  if (!restaurante_code) {
    return NextResponse.json({ error: 'Restaurante no especificado' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Resolver restaurante por código
  const { data: rest } = await supabase
    .rpc('resolve_restaurante', { p_slug_or_code: restaurante_code })

  if (!rest || rest.length === 0) {
    return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })
  }

  const restaurante_id = rest[0].id
  const restaurante_nombre = rest[0].nombre

  // Validar PIN dentro del restaurante
  const { data, error } = await supabase
    .rpc('login_pin', { p_restaurante_id: restaurante_id, p_pin: String(pin) })

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }

  const cam = data[0]

  // Solo permitir rol cocina en esta pantalla
  if (cam.rol !== 'cocina') {
    return NextResponse.json({ error: 'Esta pantalla es solo para cocineros' }, { status: 403 })
  }

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
