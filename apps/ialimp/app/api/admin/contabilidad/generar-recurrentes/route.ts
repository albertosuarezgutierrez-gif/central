import { NextResponse } from 'next/server'
import { generarRecurrentes } from '@/lib/contab-recurrentes'

export const dynamic = 'force-dynamic'

// GET /api/admin/contabilidad/generar-recurrentes  (cron diario)
// Materializa el apunte real de cada periodo de las plantillas recurrentes activas.
export async function GET() {
  try {
    const { gastos, ingresos } = await generarRecurrentes()
    return NextResponse.json({ ok: true, gastos_generados: gastos, ingresos_generados: ingresos })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
