// Cron (vercel.json): envía a contabilidad los hechos pendientes del outbox (ventas y cobros). Ver lib/enviar-hechos.ts.
import { NextResponse, type NextRequest } from 'next/server'
import { requireSecret } from '@central/core-identity'
import { manejarCronHechos } from '@/lib/cron-hechos'
import { conTaller, talleresActivosBd } from '@/lib/db'
import { leerConfigContabilidad } from '@/lib/enviar-hechos'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest): Promise<Response> {
  let secreto: string
  try {
    secreto = requireSecret('CRON_SECRET')
  } catch (e) {
    console.error('[enviar-hechos] CRON_SECRET no configurado', e)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return manejarCronHechos(req, {
    secreto, config: leerConfigContabilidad(), talleres: talleresActivosBd, conTaller: conTaller as never,
    fetch: (url, init) => fetch(url, init), ahora: () => new Date(),
  })
}
