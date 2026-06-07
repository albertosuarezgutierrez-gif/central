import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { evento_id, aforo_real, precio_total_real, coste_espacio, costes_extra } = await req.json()
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  // 1. Actualizar evento
  await supabase.from('eventos').update({
    estado: 'completado', aforo_real: aforo_real ?? null,
    precio_total_real: precio_total_real ?? null,
    coste_espacio: coste_espacio ?? null,
  }).eq('id', evento_id).eq('local_id', restauranteId)

  // 2. Imputar coste espacio
  if (coste_espacio) {
    await supabase.from('evento_costes').insert({
      evento_id, restaurante_id: restauranteId,
      tipo: 'espacio', concepto: 'Coste espacio/hacienda',
      importe: coste_espacio, es_estimado: false,
    })
  }

  // 3. Imputar personal confirmado (si no imputado ya)
  const { data: personal } = await supabase
    .from('evento_personal')
    .select('id, nombre_externo, rol, hora_inicio, hora_fin, coste_hora, personal:personal(nombre)')
    .eq('evento_id', evento_id).eq('confirmado', true)

  const { data: yaImputado } = await supabase
    .from('evento_costes').select('id').eq('evento_id', evento_id).eq('tipo', 'personal').limit(1)

  if (personal?.length && !yaImputado?.length) {
    for (const p of personal) {
      if (!p.coste_hora || !p.hora_inicio || !p.hora_fin) continue
      const horas = Math.abs((new Date(`1970-01-01T${p.hora_fin}`).getTime() - new Date(`1970-01-01T${p.hora_inicio}`).getTime()) / 3600000)
      const nombre = (p as unknown as { personal: { nombre: string } | null }).personal?.nombre ?? p.nombre_externo ?? p.rol
      await supabase.from('evento_costes').insert({
        evento_id, restaurante_id: restauranteId,
        tipo: 'personal',
        concepto: `${nombre} — ${p.rol} (${horas}h × ${p.coste_hora}€)`,
        importe: p.coste_hora * horas, personal_ev_id: p.id, es_estimado: false,
      })
    }
  }

  // 4. Costes extra
  if (costes_extra?.length) {
    await supabase.from('evento_costes').insert(
      costes_extra.map((c: { tipo: string; concepto: string; importe: number }) => ({
        evento_id, restaurante_id: restauranteId,
        tipo: c.tipo, concepto: c.concepto, importe: c.importe, es_estimado: false,
      }))
    )
  }

  // 5. Margen final
  const { data: margen } = await supabase.rpc('calcular_margen_evento', { p_evento_id: evento_id })

  return NextResponse.json({ ok: true, margen: margen?.[0] ?? null, mensaje: 'Evento cerrado.' })
}
