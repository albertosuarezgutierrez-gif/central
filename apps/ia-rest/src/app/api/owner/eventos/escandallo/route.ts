import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  // Obtener aforo del evento
  const { data: evento } = await supabase
    .from('eventos')
    .select('aforo_confirmado, aforo_previsto, cliente_nombre, factor_escandallo')
    .eq('id', evento_id)
    .eq('local_id', restauranteId)
    .single()

  if (!evento) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  const aforo = evento.aforo_confirmado ?? evento.aforo_previsto ?? 1
  const factor = evento.factor_escandallo ?? 1.0

  // Obtener menú asociado al evento con sus items y productos
  const { data: menuEvento } = await supabase
    .from('menus_evento')
    .select(`
      id, nombre, precio_por_persona,
      pases:menu_evento_pases(
        id, nombre, numero_pase,
        items:menu_evento_items(
          id, nombre, cantidad_por_persona, unidad_medida,
          producto_id,
          productos:productos(
            id, nombre, precio_coste, unidad_stock
          )
        )
      )
    `)
    .eq('evento_id', evento_id)
    .eq('local_id', restauranteId)
    .maybeSingle()

  if (!menuEvento) {
    return NextResponse.json({
      evento: { aforo, factor, nombre: evento.cliente_nombre },
      escandallo: [],
      total_coste_estimado: 0,
      mensaje: 'Sin menú asignado a este evento',
    })
  }

  // Calcular escandallo × aforo
  const ingredientes: {
    nombre: string; producto_id: string | null
    cantidad_por_persona: number; unidad: string
    cantidad_total: number; coste_unitario: number | null; coste_total: number | null
    pase: string
  }[] = []

  for (const pase of menuEvento.pases ?? []) {
    for (const item of pase.items ?? []) {
      const cantTotal = (item.cantidad_por_persona ?? 1) * aforo * factor
      const prod = Array.isArray(item.productos) ? item.productos[0] : item.productos
      ingredientes.push({
        nombre: item.nombre ?? prod?.nombre ?? '?',
        producto_id: item.producto_id,
        cantidad_por_persona: item.cantidad_por_persona ?? 1,
        unidad: item.unidad_medida ?? prod?.unidad_stock ?? 'ud',
        cantidad_total: Math.ceil(cantTotal * 100) / 100,
        coste_unitario: prod?.precio_coste ?? null,
        coste_total: prod?.precio_coste ? prod.precio_coste * cantTotal : null,
        pase: pase.nombre ?? `Pase ${pase.numero_pase}`,
      })
    }
  }

  const totalCoste = ingredientes.reduce((s, i) => s + (i.coste_total ?? 0), 0)
  const costePorPersona = aforo > 0 ? totalCoste / aforo : 0

  return NextResponse.json({
    evento: { aforo, factor, nombre: evento.cliente_nombre },
    menu: { nombre: menuEvento.nombre, precio_por_persona: menuEvento.precio_por_persona },
    escandallo: ingredientes,
    total_coste_estimado: Math.round(totalCoste * 100) / 100,
    coste_por_persona: Math.round(costePorPersona * 100) / 100,
    margen_estimado: menuEvento.precio_por_persona
      ? Math.round(((menuEvento.precio_por_persona - costePorPersona) / menuEvento.precio_por_persona) * 10000) / 100
      : null,
  })
}

// PATCH: actualizar factor_escandallo del evento
export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { evento_id, factor_escandallo } = await req.json()

  await supabase
    .from('eventos')
    .update({ factor_escandallo })
    .eq('id', evento_id)
    .eq('local_id', restauranteId)

  return NextResponse.json({ ok: true })
}
