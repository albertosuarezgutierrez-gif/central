import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET — config de comisiones + resumen por coordinador
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const personal_id = searchParams.get('personal_id')

  // Vista resumen de todos los coordinadores
  const { data: resumen } = await supabase
    .from('v_comisiones_coordinador')
    .select('*')
    .eq('restaurante_id', restauranteId)

  // Config de comisiones del coordinador seleccionado
  let config = null
  if (personal_id) {
    const { data } = await supabase
      .from('coordinador_comisiones_config')
      .select('*')
      .eq('personal_id', personal_id)
      .eq('restaurante_id', restauranteId)
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    config = data
  }

  // Comisiones pendientes de pagar
  const { data: pendientes } = await supabase
    .from('evento_comisiones')
    .select('*, personal:personal(nombre), evento:eventos(numero_evento,cliente_nombre,fecha_evento)')
    .eq('restaurante_id', restauranteId)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })

  return NextResponse.json({ resumen, config, pendientes })
}

// POST — crear/actualizar config de comisión para un coordinador
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { personal_id, tipo, valor, tramos, aplica_desde, aplica_hasta } = await req.json()

  if (!personal_id || !tipo || valor === undefined) {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  }

  // Desactivar config anterior
  await supabase.from('coordinador_comisiones_config')
    .update({ activo: false })
    .eq('personal_id', personal_id)
    .eq('restaurante_id', restauranteId)

  const { data, error } = await supabase
    .from('coordinador_comisiones_config')
    .insert({ restaurante_id: restauranteId, personal_id, tipo, valor, tramos, aplica_desde, aplica_hasta })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data }, { status: 201 })
}

// PUT — pagar comisión
export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, estado, notas } = await req.json()

  const patch: Record<string, unknown> = { estado, notas }
  if (estado === 'pagada') patch.pagada_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('evento_comisiones').update(patch)
    .eq('id', id).eq('restaurante_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comision: data })
}
