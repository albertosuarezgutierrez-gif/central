// Puerto ADMIN → plataforma lee cobros de ia-rest con Bearer OPERADOR_SHARED_SECRET.
// Expone los mismos datos que /api/super/cobro-resumen pero sin requerir x-ia-session.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()

  const { data: resumen, error } = await supabase
    .from('v_cobro_resumen_super')
    .select('*')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const totales = (resumen ?? []).reduce(
    (acc: Record<string, number>, r: Record<string, number>) => ({
      volumen_mes:   acc.volumen_mes   + (r.volumen_mes_actual  || 0),
      comision_mes:  acc.comision_mes  + (r.comision_mes_actual || 0),
      volumen_anio:  acc.volumen_anio  + (r.volumen_anio        || 0),
      comision_anio: acc.comision_anio + (r.comision_anio       || 0),
      txn_mes:       acc.txn_mes       + (r.txn_mes_actual      || 0),
    }),
    { volumen_mes: 0, comision_mes: 0, volumen_anio: 0, comision_anio: 0, txn_mes: 0 },
  )

  const { data: historico } = await supabase
    .from('resumen_cobros_mensual')
    .select('mes, volumen_eur, comision_eur, num_transacciones')
    .order('mes', { ascending: false })
    .limit(12)

  const historicoPorMes = (historico ?? []).reduce(
    (acc: Record<string, { mes: string; volumen: number; comision: number; txn: number }>, row: Record<string, string | number>) => {
      const mes = row.mes as string
      if (!acc[mes]) acc[mes] = { mes, volumen: 0, comision: 0, txn: 0 }
      acc[mes].volumen  += Number(row.volumen_eur) || 0
      acc[mes].comision += Number(row.comision_eur) || 0
      acc[mes].txn      += Number(row.num_transacciones) || 0
      return acc
    },
    {},
  )

  return NextResponse.json({
    restaurantes: resumen ?? [],
    totales,
    historico: (Object.values(historicoPorMes) as { mes: string; volumen: number; comision: number; txn: number }[])
      .sort((a, b) => b.mes.localeCompare(a.mes)),
  })
}
