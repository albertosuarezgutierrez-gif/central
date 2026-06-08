export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/carta/[code] — carta pública sin auth
// Devuelve productos activos del restaurante identificado por slug
// ?lang=en → devuelve nombres/descripciones traducidos (fallback español)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { IDIOMAS_VALIDOS } from '@/lib/useIdiomasCarta'

const supabaseAdmin = () => createServerClient()

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const lang    = req.nextUrl.searchParams.get('lang') ?? 'es'
  const idioma  = IDIOMAS_VALIDOS.includes(lang as never) ? lang : 'es'

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

  let productos: unknown[] = []

  if (idioma === 'es') {
    // Sin traducción: query directa
    const { data, error: prodErr } = await supabase
      .from('productos')
      .select('id, nombre, descripcion, precio, categoria, familia, metadata, alergenos')
      .eq('local_id', rest.id)
      .eq('activo', true)
      .order('categoria')
      .order('orden', { ascending: true })
      .order('nombre')

    if (prodErr) {
      return NextResponse.json({ error: 'Error cargando productos' }, { status: 500 })
    }
    productos = data || []
  } else {
    // Con traducción: RPC con fallback español
    const { data, error: rpcErr } = await supabase
      .rpc('get_carta_i18n', {
        p_restaurante_id: rest.id,
        p_idioma: idioma,
      })

    if (rpcErr) {
      return NextResponse.json({ error: 'Error cargando traducciones' }, { status: 500 })
    }
    productos = data || []
  }

  return NextResponse.json(
    {
      restaurante: { nombre: rest.nombre, slug: rest.slug, logo_url: rest.logo_url ?? null },
      productos,
      idioma,
    },
    {
      headers: {
        // Sin cache cuando hay idioma específico para que las traducciones se vean inmediatamente
        'Cache-Control': idioma === 'es'
          ? 'public, s-maxage=60, stale-while-revalidate=300'
          : 'public, s-maxage=30, stale-while-revalidate=60',
      },
    }
  )
}
