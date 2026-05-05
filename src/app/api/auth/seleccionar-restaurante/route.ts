// POST /api/auth/seleccionar-restaurante
// Después del selector de restaurante → devuelve session completa

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const { cuenta_id, restaurante_id } = await req.json()
  if (!cuenta_id || !restaurante_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  // Verificar que el restaurante pertenece a la cuenta
  const { data: r } = await sb
    .from('restaurantes')
    .select('id, nombre, activo')
    .eq('id', restaurante_id)
    .eq('cuenta_id', cuenta_id)
    .single()

  if (!r || !r.activo) return NextResponse.json({ error: 'Restaurante no válido' }, { status: 403 })

  // Buscar camarero owner
  const { data: cam } = await sb
    .from('camareros')
    .select('id, nombre, rol')
    .eq('cuenta_id', cuenta_id)
    .eq('restaurante_id', restaurante_id)
    .eq('rol', 'owner')
    .single()

  return NextResponse.json({
    session: {
      id: cam?.id ?? '',
      nombre: cam?.nombre ?? '',
      rol: 'owner',
      restaurante_id: r.id,
      restaurante_nombre: r.nombre,
    },
  })
}
