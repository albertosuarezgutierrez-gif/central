// ============================================================
// GET /api/carta/[code] — carta pública sin auth
// Devuelve productos activos del restaurante identificado por slug
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const supabaseAdmin = () => createServerClient()

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const supabase = supabaseAdmin()

  // Buscar restaurante por slug (case-insensitive)
  const { data: rest, error: restErr } = await supabase
    .from('restaurantes')
    .select('id, nombre, slug, logo_url')
    .eq('slug', code.toLowerCase())
    .eq('activo', true)
    .single()

  if (restErr || !rest) {
    return NextResponse.json(
      { error: 'Restaurante no encontrado' },
      { status: 404 }
    )
  }

  // Productos activos ordenados por categoría, orden, nombre
  const { data: productos, error: prodErr } = await supabase
    .from('productos')
    .select('id, nombre, descripcion, precio, categoria')
    .eq('restaurante_id', rest.id)
    .eq('activo', true)
    .order('categoria')
    .order('orden', { ascending: true })
    .order('nombre')

  if (prodErr) {
    return NextResponse.json(
      { error: 'Error cargando productos' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      restaurante: { nombre: rest.nombre, slug: rest.slug, logo_url: rest.logo_url ?? null },
      productos: productos || [],
    },
    {
      headers: {
        // Cache 1 min en edge, revalida en fondo 5 min
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    }
  )
}
