import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/owner/eventos/config
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('config_eventos')
    .select('*')
    .eq('local_id', restauranteId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si no existe, devolver defaults
  if (!data) {
    return NextResponse.json({
      config: {
        local_id: restauranteId,
        margen_food_pct: 35, margen_bebidas_pct: 45, margen_servicio_pct: 25,
        consumo_litros_hora: 0.8, merma_pct_defecto: 8,
        precio_referencia: 'precio_medio', modelo_comision: 'precio_final',
        descuento_requiere_aprobacion_desde: 5, mostrar_costes_comercial: false,
        rentabilidad_minima_pct: 25, metodo_senal: 'transferencia',
        pct_senal: 30, dias_vencimiento_senal: 7,
        modelo_facturacion: 'dos_facturas', tiene_transporte: false,
        coste_transporte_tipo: 'sin_cargo', puede_introducir_consumo: 'encargado',
        puede_aprobar_cierre: 'owner', cliente_ve_desglose: true,
        ratio_camarero_comensales: 20
      }
    })
  }
  return NextResponse.json({ config: data })
}

// POST /api/owner/eventos/config — upsert
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()

  const { data, error } = await supabase
    .from('config_eventos')
    .upsert({ ...body, local_id: restauranteId, updated_at: new Date().toISOString() },
      { onConflict: 'restaurante_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
