import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { calcularMargen, totalCostes, esRentable, RENTABILIDAD_MINIMA_PCT_DEFAULT } from '@iarest/module-presupuestos'
import { costesDeEvento } from '@/lib/presupuestos-evento'

// GET /api/owner/eventos/presupuestos
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')
  const comision_estado = searchParams.get('comision_estado')

  let query = supabase
    .from('presupuestos_evento')
    .select(`
      *,
      comercial:personal!comercial_id(id, nombre),
      evento:eventos(id, cliente_nombre, fecha_evento, tipo)
    `)
    .eq('local_id', restauranteId)
    .order('created_at', { ascending: false })

  if (evento_id) query = query.eq('evento_id', evento_id)
  if (comision_estado) query = query.eq('comision_estado', comision_estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ presupuestos: data })
}

// POST /api/owner/eventos/presupuestos — crear/actualizar
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()

  // Calcular margen real — delegado a @iarest/module-presupuestos (costes de catering
  // mapeados a líneas genéricas vía el adaptador de evento).
  const total = body.total || 0
  const margen_real_pct = calcularMargen(total, totalCostes(costesDeEvento(body))).margenPct

  // Verificar aprobación descuento si necesario
  const { data: config } = await supabase
    .from('config_eventos')
    .select('descuento_requiere_aprobacion_desde, modelo_comision, rentabilidad_minima_pct')
    .eq('local_id', restauranteId)
    .maybeSingle()

  const desc = body.descuento_aplicado_pct || 0
  const limite = config?.descuento_requiere_aprobacion_desde || 5
  if (desc > limite && !body.descuento_aprobado_por) {
    return NextResponse.json({ error: 'Descuento requiere aprobación del owner', requiere_aprobacion: true }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('presupuestos_evento')
    .upsert({
      ...body,
      local_id: restauranteId,
      margen_real_pct: Math.round(margen_real_pct * 100) / 100,
      rentable: esRentable(margen_real_pct, config?.rentabilidad_minima_pct || RENTABILIDAD_MINIMA_PCT_DEFAULT),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Guardar en histórico si es aceptado
  if (body.estado === 'aceptado' && body.evento_id) {
    const { data: ev } = await supabase.from('eventos').select('tipo, fecha_evento').eq('id', body.evento_id).single()
    await supabase.from('evento_historico_precios').insert({
      local_id: restauranteId,
      tipo_evento: ev?.tipo,
      adultos: body.adultos,
      precio_adulto_final: body.precio_adulto,
      precio_nino_final: body.precio_nino,
      margen_real_pct: Math.round(margen_real_pct * 100) / 100,
      descuento_aplicado_pct: desc,
      fecha_evento: ev?.fecha_evento,
      evento_id: body.evento_id
    })
  }

  return NextResponse.json({ presupuesto: data })
}
