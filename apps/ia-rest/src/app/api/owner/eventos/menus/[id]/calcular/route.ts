import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/owner/eventos/menus/[id]/calcular?adultos=80&ninos=12&barra_tier_id=...&barra_horas=3
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const adultos = parseInt(searchParams.get('adultos') || '1')
  const ninos = parseInt(searchParams.get('ninos') || '0')
  const barra_tier_id = searchParams.get('barra_tier_id')
  const barra_horas = parseInt(searchParams.get('barra_horas') || '3')
  const descuento_pct = parseFloat(searchParams.get('descuento_pct') || '0')

  // Calcular precio menú via RPC
  const { data: calc, error: calcErr } = await supabase
    .rpc('calcular_precio_menu_evento', {
      p_menu_id: id,
      p_restaurante_id: restauranteId,
      p_adultos: adultos,
      p_ninos: ninos
    })

  if (calcErr) return NextResponse.json({ error: calcErr.message }, { status: 500 })

  // Cargar config
  const { data: config } = await supabase
    .from('config_eventos')
    .select('margen_bebidas_pct, consumo_litros_hora, rentabilidad_minima_pct')
    .eq('local_id', restauranteId)
    .maybeSingle()

  // Calcular barra si se especificó tier
  let barra_coste = 0
  let barra_precio = 0
  let barra_nombre = ''

  if (barra_tier_id) {
    const { data: tier } = await supabase
      .from('barra_tiers')
      .select('nombre, precio_persona_hora')
      .eq('id', barra_tier_id)
      .single()

    if (tier) {
      barra_nombre = tier.nombre
      barra_precio = tier.precio_persona_hora * barra_horas * adultos
      const margen = (config?.margen_bebidas_pct || 45) / 100
      barra_coste = barra_precio * (1 - margen)
    }
  }

  const totales = calc?.totales || {}
  const precio_adulto = (totales.precio_adulto || 0)
  const subtotal_menu = (totales.total_adultos || 0) + (totales.total_ninos || 0)
  const subtotal_barra = barra_precio
  const subtotal_bruto = subtotal_menu + subtotal_barra

  const descuento_eur = subtotal_bruto * (descuento_pct / 100)
  const total_final = subtotal_bruto - descuento_eur

  const total_coste = (totales.food_cost_adulto || 0) * adultos + barra_coste
  const margen_real = total_final > 0
    ? Math.round(((total_final - total_coste) / total_final * 100) * 10) / 10
    : 0

  const rentable = margen_real >= (config?.rentabilidad_minima_pct || 25)

  return NextResponse.json({
    bloques: calc?.bloques || [],
    desglose: {
      precio_adulto: Math.round(precio_adulto * 100) / 100,
      precio_nino: Math.round(precio_adulto * 0.5 * 100) / 100,
      subtotal_menu: Math.round(subtotal_menu * 100) / 100,
      barra_nombre, barra_precio: Math.round(barra_precio * 100) / 100,
      subtotal_bruto: Math.round(subtotal_bruto * 100) / 100,
      descuento_pct, descuento_eur: Math.round(descuento_eur * 100) / 100,
      total_final: Math.round(total_final * 100) / 100,
      total_coste: Math.round(total_coste * 100) / 100,
      margen_real_pct: margen_real,
      rentable
    }
  })
}
