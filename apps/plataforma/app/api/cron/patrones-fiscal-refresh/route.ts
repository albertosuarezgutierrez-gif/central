// /api/cron/patrones-fiscal-refresh — Refresca (1×/día) las etiquetas legibles de los
// patrones de gasto/ingreso recurrentes con IA y las cachea en patrones_recurrentes_cache.
// Así el bloque «🧾 Mi declaración» de /finanzas/fiscal NO llama nunca al LLM en la
// petición (los números salen de SQL; la IA es solo cosmética). Auth: Bearer CRON_SECRET
// (o ?secret= para disparo manual).
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { refrescarPatronesIA } from '@/lib/gastos-recurrentes'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    // Cuentas con banca conectada (las que tienen movimientos → patrones que cachear).
    const cuentas = await prisma.$queryRaw<Array<{ cuenta_id: string }>>`
      SELECT DISTINCT cb.cuenta_id
      FROM cuentas_bancarias cb
      JOIN cuentas c ON c.id = cb.cuenta_id
    `

    let totalRefrescados = 0
    const errores: string[] = []
    for (const { cuenta_id } of cuentas) {
      try {
        const { refrescados } = await refrescarPatronesIA(cuenta_id)
        totalRefrescados += refrescados
      } catch (e) {
        // Best-effort por cuenta: un fallo de IA no debe tumbar el resto.
        errores.push(`${cuenta_id}: ${String(e)}`)
      }
    }

    return NextResponse.json({ ok: true, cuentas: cuentas.length, refrescados: totalRefrescados, errores })
  } catch (e) {
    console.error('[cron/patrones-fiscal-refresh]', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
