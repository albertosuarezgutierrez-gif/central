export const dynamic = 'force-dynamic'

// GET /api/super/cobro-resumen
// Panel financiero Alberto — volumen y comisiones por restaurante
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()

  // Vista agregada: todos los restaurantes activos con sus cobros
  const { data: resumen, error } = await supabase
    .from('v_cobro_resumen_super')
    .select('*')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Totales globales para Alberto
  const totales = (resumen ?? []).reduce((acc: Record<string, number>, r: Record<string, number>) => ({
    volumen_mes:   acc.volumen_mes   + (r.volumen_mes_actual  || 0),
    comision_mes:  acc.comision_mes  + (r.comision_mes_actual || 0),
    volumen_anio:  acc.volumen_anio  + (r.volumen_anio        || 0),
    comision_anio: acc.comision_anio + (r.comision_anio       || 0),
    txn_mes:       acc.txn_mes       + (r.txn_mes_actual      || 0),
  }), { volumen_mes: 0, comision_mes: 0, volumen_anio: 0, comision_anio: 0, txn_mes: 0 })

  // Histórico mensual global (últimos 12 meses)
  const { data: historico } = await supabase
    .from('resumen_cobros_mensual')
    .select('mes, volumen_eur, comision_eur, num_transacciones')
    .order('mes', { ascending: false })
    .limit(12)

  // Agrupar histórico por mes
  const historicoPorMes = (historico ?? []).reduce((acc: Record<string, { mes: string; volumen: number; comision: number; txn: number }>, row: Record<string, string | number>) => {
    const mes = row.mes as string
    if (!acc[mes]) acc[mes] = { mes, volumen: 0, comision: 0, txn: 0 }
    acc[mes].volumen   += Number(row.volumen_eur) || 0
    acc[mes].comision  += Number(row.comision_eur) || 0
    acc[mes].txn       += Number(row.num_transacciones) || 0
    return acc
  }, {})

  return NextResponse.json({
    restaurantes: resumen ?? [],
    totales,
    historico: (Object.values(historicoPorMes) as { mes: string; volumen: number; comision: number; txn: number }[]).sort((a, b) => b.mes.localeCompare(a.mes)),
  })
}
