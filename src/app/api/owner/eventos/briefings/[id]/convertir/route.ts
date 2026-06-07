import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST /api/owner/eventos/briefings/[id]/convertir
// Convierte briefing en presupuesto + evento
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  // Cargar briefing
  const { data: briefing, error: bErr } = await supabase
    .from('evento_briefing')
    .select('*')
    .eq('id', id)
    .eq('local_id', restauranteId)
    .single()

  if (bErr || !briefing) return NextResponse.json({ error: 'Briefing no encontrado' }, { status: 404 })

  const resp = briefing.respuestas as Record<string, unknown>

  // Crear evento desde el briefing
  const { data: evento, error: eErr } = await supabase
    .from('eventos')
    .insert({
      restaurante_id: restauranteId,
      briefing_id: id,
      tipo: resp.tipo_evento || 'evento',
      estado: 'presupuesto',
      cliente_nombre: briefing.cliente_nombre,
      cliente_email: briefing.cliente_email,
      cliente_telefono: briefing.cliente_telefono,
      aforo_previsto: (resp.adultos as number || 0) + (resp.ninos as number || 0),
      fecha_evento: resp.fecha_tentativa || null,
      notas_internas: briefing.resumen_ia || ''
    })
    .select()
    .single()

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

  // Crear presupuesto inicial
  const adultos = resp.adultos as number || 0
  const ninos = resp.ninos as number || 0
  const precioAdulto = briefing.precio_estimado_min || 0
  const precioNino = (resp.presupuesto_nino as number) || 0

  const { data: presupuesto, error: pErr } = await supabase
    .from('presupuestos_evento')
    .insert({
      restaurante_id: restauranteId,
      evento_id: evento.id,
      briefing_id: id,
      comercial_id: briefing.comercial_id,
      adultos, ninos,
      precio_adulto: precioAdulto,
      precio_nino: precioNino,
      total: (adultos * precioAdulto) + (ninos * precioNino),
      estado: 'borrador'
    })
    .select()
    .single()

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  // Crear declaración alérgenos si hay datos
  const alergenos = resp.alergenos as string[] || []
  if (alergenos.length > 0 || resp.restricciones_dieteticas) {
    await supabase.from('evento_alergenos_declaracion').insert({
      restaurante_id: restauranteId,
      evento_id: evento.id,
      briefing_id: id,
      alergenos_declarados: alergenos,
      restricciones_dieteticas: resp.restricciones_dieteticas as string[] || [],
      ninguno_conocido: alergenos.length === 0
    })
  }

  // Marcar briefing como convertido
  await supabase.from('evento_briefing')
    .update({ estado: 'convertido', evento_id: evento.id })
    .eq('id', id)

  return NextResponse.json({ ok: true, evento_id: evento.id, presupuesto_id: presupuesto.id })
}
