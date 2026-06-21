export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// Vincula un evento de cocina (/produccion) con la ficha de evento del CRM (tabla `eventos`),
// para que la "boda" sea UNA entidad: cocina + material + presupuesto sobre el mismo evento.
//   GET  — devuelve la ficha CRM vinculada (o null)
//   POST — { evento_id?, tipo? }: enlaza a una ficha existente, o si no se pasa crea una mínima
//          desde el evento de cocina; re-apunta el material ya asignado al id del evento CRM.

type SB = ReturnType<typeof createServerClient>
const EV_SELECT = 'id, numero_evento, tipo, estado, fecha_evento, aforo_previsto, precio_total'

async function cocinaEvento(supabase: SB, rid: string, id: string) {
  const { data } = await supabase
    .from('cocina_eventos')
    .select('id, nombre, fecha_evento, pax, ubicacion, evento_id')
    .eq('id', id).eq('local_id', rid)
    .single()
  return data as { id: string; nombre: string; fecha_evento: string | null; pax: number | null; ubicacion: string | null; evento_id: string | null } | null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await params

  const ce = await cocinaEvento(supabase, rid, id)
  if (!ce) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
  if (!ce.evento_id) return NextResponse.json({ evento: null })

  const { data } = await supabase.from('eventos').select(EV_SELECT).eq('id', ce.evento_id).eq('local_id', rid).single()
  return NextResponse.json({ evento: data ?? null })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await params

  const ce = await cocinaEvento(supabase, rid, id)
  if (!ce) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  let eventoId = ce.evento_id

  // 1) Enlazar a una ficha CRM existente (si se indica).
  if (!eventoId && body.evento_id) {
    const { data: ex } = await supabase.from('eventos').select('id').eq('id', body.evento_id).eq('local_id', rid).single()
    if (!ex) return NextResponse.json({ error: 'Ficha de evento (CRM) no encontrada' }, { status: 404 })
    eventoId = ex.id
  }

  // 2) Si sigue sin ficha, crear una mínima desde el evento de cocina.
  if (!eventoId) {
    const { data: rest } = await supabase.from('restaurantes').select('cuenta_id').eq('id', rid).single()
    const aforo = Number(ce.pax) > 0 ? Number(ce.pax) : 1
    const fecha = ce.fecha_evento || new Date().toISOString().slice(0, 10)
    const { data: nuevo, error } = await supabase.from('eventos').insert({
      local_id: rid,
      cuenta_id: rest?.cuenta_id ?? null,
      tipo: typeof body.tipo === 'string' && body.tipo ? body.tipo : 'otro',
      cliente_nombre: ce.nombre,
      fecha_evento: fecha,
      aforo_previsto: aforo,
      modo_local: 'cerrado',
      espacio_descripcion: ce.ubicacion ?? null,
      requiere_appcc: true,
      notas_cocina: 'Ficha creada desde Producción (cocina central).',
    }).select('id').single()
    if (error || !nuevo) return NextResponse.json({ error: error?.message ?? 'No se pudo crear la ficha CRM' }, { status: 500 })
    eventoId = nuevo.id
  }

  // 3) Enlazar el evento de cocina y re-apuntar el material ya asignado al id del evento CRM.
  await supabase.from('cocina_eventos').update({ evento_id: eventoId }).eq('id', id).eq('local_id', rid)
  await supabase.from('materiales_asignacion')
    .update({ destino_ref: eventoId })
    .eq('restaurante_id', rid).eq('destino_tipo', 'evento').eq('destino_ref', id)

  const { data } = await supabase.from('eventos').select(EV_SELECT).eq('id', eventoId).single()
  return NextResponse.json({ evento: data })
}
