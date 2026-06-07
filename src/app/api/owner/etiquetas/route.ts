export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET  /api/owner/etiquetas          → config + productos con alérgenos
 * POST /api/owner/etiquetas          → guardar config del operador
 * PATCH /api/owner/etiquetas         → guardar EAN de un producto
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const [rConfig, rProductos, rRestaurante] = await Promise.all([
    supabase
      .from('etiquetas_config')
      .select('*')
      .eq('local_id', rid)
      .maybeSingle(),
    supabase
      .from('productos')
      .select('id, nombre, descripcion, precio, categoria, alergenos, familia, ean_codigo, stock_actual, unidad_stock')
      .eq('local_id', rid)
      .eq('activo', true)
      .order('categoria')
      .order('nombre'),
    supabase
      .from('restaurantes')
      .select('nombre, nif, razon_social, direccion_fiscal')
      .eq('id', rid)
      .single(),
  ])

  return NextResponse.json({
    config: rConfig.data ?? null,
    productos: rProductos.data ?? [],
    restaurante: rRestaurante.data ?? null,
  })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const {
    nombre_operador, nif_operador, direccion_operador,
    rgseaa_numero, pais_origen, incluir_tabla_nutricional
  } = body

  const { data, error } = await supabase
    .from('etiquetas_config')
    .upsert({
      restaurante_id:           rid,
      nombre_operador:          nombre_operador ?? '',
      nif_operador:             nif_operador ?? '',
      direccion_operador:       direccion_operador ?? '',
      rgseaa_numero:            rgseaa_numero ?? null,
      pais_origen:              pais_origen ?? 'España',
      incluir_tabla_nutricional: incluir_tabla_nutricional ?? false,
      updated_at:               new Date().toISOString(),
    }, { onConflict: 'restaurante_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, config: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { producto_id, ean_codigo } = await req.json()
  if (!producto_id) return NextResponse.json({ error: 'producto_id requerido' }, { status: 400 })

  const { error } = await supabase
    .from('productos')
    .update({ ean_codigo: ean_codigo?.trim() || null })
    .eq('id', producto_id)
    .eq('local_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
