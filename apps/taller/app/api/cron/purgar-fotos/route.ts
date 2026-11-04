// Cron diario (vercel.json): borra las fotos de daños y de trabajo cuyo plazo de conservación ha vencido. Ver lib/purga-fotos.ts.
import { NextResponse, type NextRequest } from 'next/server'
import { requireSecret } from '@central/core-identity'
import { almacenActivo } from '@/lib/almacen'
import { manejarCronPurga } from '@/lib/cron-purga'
import { conTaller, talleresActivosBd } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest): Promise<Response> {
  let secreto: string
  try {
    secreto = requireSecret('CRON_SECRET')
  } catch (e) {
    // Sin secreto configurado nadie entra (y no se cuenta por qué a quien llama).
    console.error('[purga-fotos] CRON_SECRET no configurado', e)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return manejarCronPurga(req, {
    secreto, talleres: talleresActivosBd, conTaller: conTaller as never, almacen: almacenActivo, ahora: () => new Date(),
  })
}
