import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const LIMITES_LEGALES: Record<string, { limite: number; operador: 'gte' | 'lte'; descripcion: string }> = {
  temperatura_camara:             { limite: 4,  operador: 'lte', descripcion: '≤4°C refrigerado >24h' },
  temperatura_coccion:            { limite: 65, operador: 'gte', descripcion: '≥65°C en centro producto' },
  temperatura_transporte_salida:  { limite: 4,  operador: 'lte', descripcion: '≤4°C salida transporte' },
  temperatura_transporte_llegada: { limite: 8,  operador: 'lte', descripcion: '≤8°C llegada en destino' },
  temperatura_servicio_caliente:  { limite: 63, operador: 'gte', descripcion: '≥63°C servicio caliente' },
  temperatura_servicio_frio:      { limite: 8,  operador: 'lte', descripcion: '≤8°C servicio frío' },
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('evento_appcc')
    .select('*, registrado_por_personal:personal(id, nombre)')
    .eq('evento_id', evento_id)
    .eq('restaurante_id', restauranteId)
    .order('hora_registro', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calcular resumen de cumplimiento
  const total = data?.length ?? 0
  const cumple = data?.filter(r => r.cumple === true).length ?? 0
  const incidencias = data?.filter(r => r.cumple === false).length ?? 0

  return NextResponse.json({ registros: data, resumen: { total, cumple, incidencias } })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const {
    evento_id, tipo_registro, valor, notas,
    plato_testigo_plato, plato_testigo_lote, plato_testigo_ubicacion,
  } = body

  if (!evento_id || !tipo_registro) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  // Calcular si cumple el límite legal
  let cumple: boolean | null = null
  let limite_legal: number | null = null
  if (valor !== null && valor !== undefined && LIMITES_LEGALES[tipo_registro]) {
    const config = LIMITES_LEGALES[tipo_registro]
    limite_legal = config.limite
    cumple = config.operador === 'lte' ? valor <= config.limite : valor >= config.limite
  }

  // Si es plato testigo, calcular expiración (7 días)
  let plato_testigo_expira_at: string | null = null
  if (tipo_registro === 'plato_testigo') {
    const expira = new Date()
    expira.setDate(expira.getDate() + 7)
    plato_testigo_expira_at = expira.toISOString()
  }

  const { data, error } = await supabase
    .from('evento_appcc')
    .insert({
      evento_id,
      restaurante_id: restauranteId,
      tipo_registro,
      valor: valor !== undefined ? valor : null,
      limite_legal,
      cumple,
      registrado_por: session.id,
      plato_testigo_plato,
      plato_testigo_lote,
      plato_testigo_ubicacion,
      plato_testigo_expira_at,
      notas,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si hay incidencia (no cumple), actualizar flag en evento
  if (cumple === false) {
    await supabase
      .from('eventos')
      .update({ plato_testigo_ok: false })
      .eq('id', evento_id)
      .eq('restaurante_id', restauranteId)
  }

  // Si es plato testigo OK, marcar en evento
  if (tipo_registro === 'plato_testigo') {
    await supabase
      .from('eventos')
      .update({ plato_testigo_ok: true })
      .eq('id', evento_id)
      .eq('restaurante_id', restauranteId)
  }

  return NextResponse.json({ registro: data, cumple, limite_legal }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id } = await req.json()
  await supabase.from('evento_appcc').delete()
    .eq('id', id).eq('restaurante_id', restauranteId)

  return NextResponse.json({ ok: true })
}
