import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET /api/owner/eventos/[id]/informe
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('evento_informe_ia')
    .select('*')
    .eq('evento_id', id)
    .eq('restaurante_id', restauranteId)
    .order('generado_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // También cargar datos de cierre del evento
  const { data: evento } = await supabase
    .from('eventos')
    .select('estado, aforo_real, aforo_previsto, consumo_real, factura_adicional_eur, aprobado_cierre_at')
    .eq('id', id)
    .single()

  return NextResponse.json({ informe: data, evento_cierre: evento })
}
