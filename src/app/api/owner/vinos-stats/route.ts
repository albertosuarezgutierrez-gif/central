import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const { data, error } = await supabase
    .from('v_vinos_stats')
    .select('*')
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Totales agregados
  const totales = (data ?? []).reduce(
    (acc, v) => ({
      unidades: acc.unidades + Number(v.unidades_vendidas),
      facturado: acc.facturado + Number(v.facturado_eur),
      referencias: acc.referencias + 1,
    }),
    { unidades: 0, facturado: 0, referencias: 0 }
  )

  return NextResponse.json({ vinos: data ?? [], totales })
}
