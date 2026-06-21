import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const CONDICIONES_DEFECTO = `1. El presente contrato formaliza la reserva del servicio de catering/restauración para el evento descrito.

2. SEÑAL: Para confirmar la reserva, el cliente deberá abonar la señal indicada antes de la fecha límite. El impago de la señal en plazo implica la liberación de la fecha.

3. AFORO: El aforo definitivo deberá confirmarse con un mínimo de 14 días de antelación. Variaciones inferiores al 10% no afectan al precio total.

4. CANCELACIÓN: La cancelación con más de 30 días de antelación implica la devolución del 50% de la señal. Con menos de 30 días, la señal queda en concepto de gastos de gestión.

5. MENÚ: El menú acordado se servirá según lo especificado. Cualquier modificación deberá comunicarse con un mínimo de 7 días de antelación.

6. ALÉRGENOS: El cliente es responsable de comunicar las alergias e intolerancias alimentarias de los comensales con suficiente antelación.

7. PRECIO: El precio acordado incluye los servicios especificados. Cualquier servicio adicional será presupuestado y acordado por separado.`

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')

  if (!evento_id) {
    const { data, error } = await supabase
      .from('evento_contratos')
      .select('*, coordinador:personal(nombre)')
      .eq('local_id', restauranteId)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ contratos: data })
  }

  const { data, error } = await supabase
    .from('evento_contratos')
    .select('*')
    .eq('evento_id', evento_id)
    .eq('local_id', restauranteId)
    .single()

  if (error) return NextResponse.json({ contrato: null })
  return NextResponse.json({ contrato: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  const { evento_id, condiciones_texto, senial_fecha_limite } = body

  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  // Cargar datos del evento para el contrato
  const { data: ev } = await supabase
    .from('eventos')
    .select('fecha_evento, aforo_previsto, precio_total, senial_importe, coordinador_id')
    .eq('id', evento_id).single()

  const { data, error } = await supabase
    .from('evento_contratos')
    .insert({
      evento_id,
      local_id: restauranteId,
      coordinador_id: ev?.coordinador_id ?? session.id,
      fecha_evento: ev?.fecha_evento,
      aforo: ev?.aforo_previsto,
      precio_total: ev?.precio_total,
      senial_importe: ev?.senial_importe,
      senial_fecha_limite,
      condiciones_texto: condiciones_texto ?? CONDICIONES_DEFECTO,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.iarest.es'}/contrato/${data.firma_token}`
  return NextResponse.json({ contrato: data, url_firma: url }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  if (updates.enviado) {
    updates.enviado_at = new Date().toISOString()
    updates.estado = 'enviado'
    delete updates.enviado
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('evento_contratos').update(updates)
    .eq('id', id).eq('local_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contrato: data })
}
