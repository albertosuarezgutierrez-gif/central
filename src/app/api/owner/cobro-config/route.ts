export const dynamic = 'force-dynamic'

// GET/PUT /api/owner/cobro-config
// Configuración del módulo ia.rest cobro por restaurante
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export const runtime = 'nodejs'



export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'super_admin'].includes(session.rol))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  // restauranteId siempre tiene valor (fallback demo)

  const supabase = createServerClient()

  // Obtener config cobro
  const { data: config } = await supabase
    .from('cobro_config')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .single()

  // Obtener resumen mes actual
  const mesActual = new Date()
  mesActual.setDate(1)
  const mesStr = mesActual.toISOString().slice(0, 10)

  const { data: resumen } = await supabase
    .from('resumen_cobros_mensual')
    .select('volumen_eur, comision_eur, num_transacciones, descuento_cuota_eur')
    .eq('restaurante_id', restauranteId)
    .eq('mes', mesStr)
    .single()

  // Resumen últimos 6 meses
  const { data: historial } = await supabase
    .from('resumen_cobros_mensual')
    .select('mes, volumen_eur, comision_eur, num_transacciones, descuento_cuota_eur')
    .eq('restaurante_id', restauranteId)
    .order('mes', { ascending: false })
    .limit(6)

  return NextResponse.json({
    config: config ?? {
      modo_cobro: 'cuenta_abierta',
      timer_inactividad_min: 45,
      ia_cobro_activo: false,
    },
    mes_actual: resumen ?? {
      volumen_eur: 0,
      comision_eur: 0,
      num_transacciones: 0,
      descuento_cuota_eur: 0,
    },
    historial: historial ?? [],
    tramos: [
      { desde: 0,     hasta: 2000,  descuento: 0,  label: '0 – 2.000 €'   },
      { desde: 2000,  hasta: 5000,  descuento: 15, label: '2.000 – 5.000 €' },
      { desde: 5000,  hasta: 10000, descuento: 30, label: '5.000 – 10.000 €' },
      { desde: 10000, hasta: 20000, descuento: 50, label: '10.000 – 20.000 €' },
      { desde: 20000, hasta: null,  descuento: 59, label: '+20.000 €'       },
    ],
  })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'super_admin'].includes(session.rol))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  // restauranteId siempre tiene valor (fallback demo)

  const body = await req.json()
  const allowed = ['modo_cobro', 'timer_inactividad_min', 'qr_llamar_camarero']
  const patch: Record<string, unknown> = {}

  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Sin campos válidos' }, { status: 400 })
  }

  // Validar qr_llamar_camarero (booleano)
  if ('qr_llamar_camarero' in patch && typeof patch.qr_llamar_camarero !== 'boolean') {
    return NextResponse.json({ error: 'qr_llamar_camarero inválido' }, { status: 400 })
  }

  // Validar modo_cobro
  if (patch.modo_cobro && !['por_ronda', 'pre_auth', 'cuenta_abierta'].includes(patch.modo_cobro as string)) {
    return NextResponse.json({ error: 'modo_cobro inválido' }, { status: 400 })
  }

  // Validar timer
  if (patch.timer_inactividad_min && ![30, 45, 60, 90].includes(patch.timer_inactividad_min as number)) {
    return NextResponse.json({ error: 'timer_inactividad_min inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('cobro_config')
    .upsert({ restaurante_id: restauranteId, ...patch }, { onConflict: 'restaurante_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, config: data })
}
