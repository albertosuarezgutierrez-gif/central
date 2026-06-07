import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { evento_id, nueva_fecha } = await req.json()
  if (!evento_id || !nueva_fecha) {
    return NextResponse.json({ error: 'Falta evento_id o nueva_fecha' }, { status: 400 })
  }

  // Verificar que el evento pertenece al restaurante
  const { data: original } = await supabase
    .from('eventos')
    .select('id, restaurante_id')
    .eq('id', evento_id)
    .eq('local_id', restauranteId)
    .single()

  if (!original) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  const { data: nuevo_id, error } = await supabase
    .rpc('clonar_evento', { p_evento_id: evento_id, p_nueva_fecha: nueva_fecha })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cargar el evento clonado completo
  const { data: nuevo_evento } = await supabase
    .from('eventos')
    .select('*, espacios_evento(id, nombre, tipo)')
    .eq('id', nuevo_id)
    .single()

  return NextResponse.json({ evento: nuevo_evento }, { status: 201 })
}
