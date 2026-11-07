import { NextResponse } from 'next/server'
import { autorizacionBearerValida } from '@central/core-identity'
import { LOTE_REENVIO, candidatasReenvioTodas, reenviarLote } from '@/lib/hechos-contabilidad'

export const maxDuration = 60

// Vercel Cron diario: reenvía a contabilidad las nóminas CONFIRMADAS cuyo envío quedó reintentable (pendiente_vincular,
// sin_configurar, error) o sin anotar (NULL). Recorre todas las empresas, pero cada envío va con la empresa_id de SU fila.
// Idempotente por ref `nomina:<id>` (contabilidad responde «duplicado»). Lote de 25 y presupuesto de 45 s: lo que no cabe,
// mañana (de la más antigua a la más nueva). `CRON_SECRET` sin fallback (`autorizacionBearerValida`).
export async function GET(req: Request) {
  if (!autorizacionBearerValida(req, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let candidatas
  try {
    candidatas = await candidatasReenvioTodas(LOTE_REENVIO + 1)
  } catch (e) {
    // «No he podido mirar» no es «no hay nada pendiente»: 500 para que se vea.
    console.error('[cron/reenviar-contabilidad] no se pudieron leer las nóminas pendientes', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, error: 'no se pudieron leer las nóminas pendientes' }, { status: 500 })
  }
  const r = await reenviarLote(candidatas, LOTE_REENVIO, { presupuestoMs: 45_000 })
  // Sin ids de empleado ni importes en la respuesta del cron: solo recuentos.
  return NextResponse.json({ ok: true, procesadas: r.procesadas, quedan: r.quedan, por_estado: r.porEstado })
}
