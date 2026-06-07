import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/owner/eventos/barra-tiers
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('barra_tiers')
    .select(`
      *,
      productos:barra_tier_productos(
        id, categoria, es_sin_alcohol,
        producto:productos(id, nombre, precio_venta, tier_barra)
      )
    `)
    .eq('local_id', restauranteId)
    .eq('activo', true)
    .order('orden')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tiers: data })
}

// POST /api/owner/eventos/barra-tiers — crear tier
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { nombre, precio_persona_hora, orden, requiere_consulta, productos } = body

  if (!nombre) return NextResponse.json({ error: 'Falta nombre' }, { status: 400 })

  const { data: tier, error } = await supabase
    .from('barra_tiers')
    .insert({ local_id: restauranteId, nombre, precio_persona_hora: precio_persona_hora || 0, orden: orden || 0, requiere_consulta: !!requiere_consulta })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insertar productos del tier
  if (productos?.length) {
    await supabase.from('barra_tier_productos').insert(
      productos.map((p: { producto_id: string; categoria?: string; es_sin_alcohol?: boolean }) => ({
        local_id: restauranteId,
        tier_id: tier.id,
        producto_id: p.producto_id,
        categoria: p.categoria,
        es_sin_alcohol: !!p.es_sin_alcohol
      }))
    )
  }

  return NextResponse.json({ tier })
}
