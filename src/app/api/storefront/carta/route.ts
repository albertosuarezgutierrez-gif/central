// GET /api/storefront/carta?slug=sloppy-joes
// Endpoint público — sin auth. Devuelve config + productos del restaurante.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug requerido' }, { status: 400 })

  const supabase = createServerClient()

  // 1. Config del storefront
  const { data: config, error: cfgErr } = await supabase
    .from('storefront_config')
    .select('*')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (cfgErr || !config) {
    return NextResponse.json({ error: 'Tienda no encontrada o inactiva' }, { status: 404 })
  }

  // 2. Productos del restaurante (no agotados, ordenados)
  const { data: productos } = await supabase
    .from('productos')
    .select('id, nombre, descripcion, precio, seccion, stock_agotado_at, es_fuera_carta, alergenos')
    .eq('restaurante_id', config.restaurante_id)
    .eq('activo', true)
    .is('stock_agotado_at', null)
    .order('seccion')
    .order('nombre')

  // 3. Agrupar por sección
  const secciones: Record<string, typeof productos> = {}
  for (const p of productos ?? []) {
    const sec = p.seccion ?? 'otros'
    if (!secciones[sec]) secciones[sec] = []
    secciones[sec]!.push(p)
  }

  return NextResponse.json({
    config: {
      slug: config.slug,
      nombre_publico: config.nombre_publico,
      descripcion: config.descripcion,
      logo_url: config.logo_url,
      color_primario: config.color_primario,
      acepta_delivery: config.acepta_delivery,
      acepta_recogida: config.acepta_recogida,
      tiempo_estimado_min: config.tiempo_estimado_min,
      pedido_minimo_eur: config.pedido_minimo_eur,
    },
    secciones,
  })
}
