import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// Mapeo tipo_negocio → queries Unsplash curadas
const QUERIES: Record<string, string[]> = {
  restaurante:  ['restaurant interior cozy', 'fine dining food', 'restaurant table candles'],
  bar:          ['bar interior night', 'cocktail bar', 'tapas bar spain'],
  cafeteria:    ['cafe coffee morning', 'bakery cafe interior', 'coffee shop cozy'],
  taberna:      ['spanish tavern', 'bodega wine bar', 'traditional restaurant spain'],
  pizzeria:     ['pizza restaurant', 'italian trattoria', 'wood fired pizza'],
  hamburgueseria: ['burger restaurant', 'american diner', 'gourmet burger'],
  asador:       ['grill restaurant meat', 'steakhouse interior', 'bbq restaurant'],
  marisqueria:  ['seafood restaurant', 'fish market restaurant', 'mediterranean seafood'],
}

const DEFAULT_QUERIES = ['restaurant interior', 'food photography', 'dining table']

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data: rest } = await supabase
    .from('restaurantes')
    .select('tipo_negocio, nombre')
    .eq('id', restauranteId)
    .maybeSingle()

  const tipo = rest?.tipo_negocio?.toLowerCase() ?? 'restaurante'
  const queries = QUERIES[tipo] ?? DEFAULT_QUERIES

  // Unsplash Source API (no requiere API key, devuelve imágenes aleatorias por query)
  // Resolución 1200x600 para portadas web
  const sugerencias = queries.map((q, i) => ({
    id: i,
    url: `https://source.unsplash.com/1200x600/?${encodeURIComponent(q)}`,
    query: q,
    credit: 'Unsplash',
  }))

  return NextResponse.json({ ok: true, sugerencias, tipo_negocio: tipo })
}
