import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/recomendaciones — recomendaciones activas ahora mismo
// Accesible para cualquier rol autenticado (camarero, jefe_sala, owner)
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const restaurante_id = await getRestauranteId(req)
  if (!restaurante_id) return NextResponse.json({ error: 'Sin restaurante' }, { status: 400 })

  const db = createServerClient()
  const { data, error } = await db
    .from('v_recomendaciones_activas')
    .select('id, producto_nombre, precio, categoria, nota, hora_desde, hora_hasta, cantidad_max, cantidad_servida, cantidad_restante')
    .eq('restaurante_id', restaurante_id)
    .order('producto_nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recomendaciones: data ?? [] })
}
