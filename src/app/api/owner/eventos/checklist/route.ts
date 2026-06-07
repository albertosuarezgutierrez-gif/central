import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { tgAlert } from '@/lib/telegram'

// GET /api/owner/eventos/checklist?evento_id=...
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')

  let query = supabase
    .from('evento_checklist_item')
    .select('*, completado_por_personal:personal(id, nombre)')
    .eq('local_id', restauranteId)
    .order('orden')

  if (evento_id) query = query.eq('evento_id', evento_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total = data?.length || 0
  const completados = data?.filter(i => i.completado).length || 0

  return NextResponse.json({ items: data, progreso: { total, completados, pct: total > 0 ? Math.round(completados / total * 100) : 0 } })
}

// POST — crear items (bulk desde plantilla o manual)
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { evento_id, items, plantilla_id } = body

  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  let itemsToInsert = items || []

  // Si viene de plantilla, cargar sus items
  if (plantilla_id && !items?.length) {
    const { data: plantilla } = await supabase
      .from('plantillas_evento')
      .select('checklist_items')
      .eq('id', plantilla_id)
      .single()

    if (plantilla?.checklist_items) {
      itemsToInsert = plantilla.checklist_items
    }
  }

  const { data, error } = await supabase
    .from('evento_checklist_item')
    .insert(itemsToInsert.map((item: { texto: string; orden?: number; horas_antes_alerta?: number }, i: number) => ({
      restaurante_id: restauranteId,
      evento_id,
      plantilla_id: plantilla_id || null,
      texto: item.texto,
      orden: item.orden ?? i,
      horas_antes_alerta: item.horas_antes_alerta || 1
    })))
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data })
}

// PATCH — marcar item completado / verificar alerta
export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id, completado, evento_id } = await req.json()

  const { data, error } = await supabase
    .from('evento_checklist_item')
    .update({
      completado,
      completado_por: completado ? session.id : null,
      completado_at: completado ? new Date().toISOString() : null
    })
    .eq('id', id)
    .eq('local_id', restauranteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si se desmarca, verificar si hay items pendientes cerca del evento
  if (!completado && evento_id) {
    const { data: evento } = await supabase
      .from('eventos')
      .select('fecha_evento, cliente_nombre')
      .eq('id', evento_id)
      .single()

    if (evento?.fecha_evento) {
      const horasRestantes = (new Date(evento.fecha_evento).getTime() - Date.now()) / 3600000
      if (horasRestantes < 2 && horasRestantes > 0) {
        const { data: pendientes } = await supabase
          .from('evento_checklist_item')
          .select('texto')
          .eq('evento_id', evento_id)
          .eq('completado', false)

        if (pendientes && pendientes.length > 0) {
          await tgAlert(
            `⚠️ <b>Checklist incompleto — ${evento.cliente_nombre}</b>\n` +
            `Faltan ${pendientes.length} tareas con ${Math.round(horasRestantes * 10) / 10}h para el evento:\n` +
            pendientes.slice(0, 5).map(p => `· ${p.texto}`).join('\n'),
            'aviso'
          )
        }
      }
    }
  }

  return NextResponse.json({ item: data })
}
