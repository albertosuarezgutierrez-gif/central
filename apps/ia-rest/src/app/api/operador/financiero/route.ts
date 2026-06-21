// Puerto del OPERADOR (god-panel de la matriz). Resumen financiero anual de un local
// (tenant de ia-rest) para el dashboard consolidado de apps/plataforma. Read-only,
// server-to-server con `Authorization: Bearer <OPERADOR_SHARED_SECRET>`. Lee la vista
// `v_resumen_financiero_anual` de la BD viva de ia-rest (mismo cliente/schema que el
// resto del puerto). Additivo, no toca nada más.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// GET /api/operador/financiero?local_id=<uuid>&anio=<int>
// → { ingresos_base, gastos_base, resultado } (0 si no hay fila para ese local/año).
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const localId = searchParams.get('local_id')
  const anio = Number(searchParams.get('anio'))
  if (!localId) return NextResponse.json({ error: 'local_id requerido' }, { status: 400 })
  if (!Number.isInteger(anio)) return NextResponse.json({ error: 'anio (entero) requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('v_resumen_financiero_anual')
    .select('ingresos_base, gastos_base, resultado')
    .eq('local_id', localId)
    .eq('anio', anio)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ingresos_base: Number(data?.ingresos_base ?? 0),
    gastos_base: Number(data?.gastos_base ?? 0),
    resultado: Number(data?.resultado ?? 0),
  })
}
