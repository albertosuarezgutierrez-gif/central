import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST /api/owner/eventos/cerrar
// Cierra un evento: marca como completado, imputa costes de personal automáticamente
// y calcula el margen real
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { evento_id, aforo_confirmado, coste_espacio } = await req.json()
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  // 1. Actualizar aforo real y estado
  await supabase.from('eventos').update({
    estado: 'completado',
    ...(aforo_confirmado ? { aforo_confirmado } : {}),
  }).eq('id', evento_id).eq('restaurante_id', restauranteId)

  // 2. Imputar coste del espacio si se indica
  if (coste_espacio) {
    await supabase.from('evento_costes').insert({
      evento_id, restaurante_id: restauranteId,
      tipo: 'espacio', descripcion: 'Coste uso espacio',
      importe: coste_espacio, origen: 'manual',
    })
  }

  // 3. Imputar costes de personal asignado al evento
  const { data: personalEvento } = await supabase
    .from('evento_personal')
    .select('*')
    .eq('evento_id', evento_id)
    .eq('restaurante_id', restauranteId)
    .eq('confirmado', true)

  for (const p of personalEvento ?? []) {
    if (p.hora_inicio && p.hora_fin && p.coste_hora) {
      const [h1, m1] = (p.hora_inicio as string).split(':').map(Number)
      const [h2, m2] = (p.hora_fin as string).split(':').map(Number)
      const horas = ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60
      if (horas > 0) {
        const importe = horas * p.coste_hora
        // Solo imputar si no existe ya
        const { count } = await supabase.from('evento_costes')
          .select('id', { count: 'exact', head: true })
          .eq('evento_id', evento_id)
          .eq('personal_id', p.personal_id ?? p.id)
          .eq('tipo', 'personal')

        if (!count) {
          await supabase.from('evento_costes').insert({
            evento_id, restaurante_id: restauranteId,
            tipo: 'personal',
            descripcion: `Personal: ${p.rol} (${horas.toFixed(1)}h)`,
            importe,
            origen: 'personal_evento',
            origen_id: p.id,
            personal_id: p.personal_id,
            horas,
            coste_hora: p.coste_hora,
          })
        }
      }
    }
  }

  // 4. Calcular rentabilidad final
  const { data: rent } = await supabase.rpc('calcular_rentabilidad_evento', {
    p_evento_id: evento_id,
  })

  const rentabilidad = rent?.[0] ?? null

  // 5. Guardar coste_total en eventos para acceso rápido
  if (rentabilidad) {
    await supabase.from('eventos').update({
      coste_total: rentabilidad.coste_total,
    }).eq('id', evento_id)
  }

  return NextResponse.json({
    ok: true,
    estado: 'completado',
    rentabilidad,
    personal_imputado: personalEvento?.filter(p => p.confirmado && p.coste_hora)?.length ?? 0,
  })
}
