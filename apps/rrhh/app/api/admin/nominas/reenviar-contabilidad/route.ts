/**
 * «Reintentar envío a contabilidad» del responsable: reenvía las nóminas CONFIRMADAS de SU empresa (la de getSesion(), nunca
 * de la petición) con el envío reintentable (pendiente_vincular, sin_configurar, error) o sin anotar (NULL).
 * Idempotente por ref `nomina:<id>`. Lote de 25 y presupuesto de 45 s; si quedan, `quedan: true` y se vuelve a pulsar.
 */
import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { LOTE_REENVIO, candidatasReenvioEmpresa, reenviarLote } from '@/lib/hechos-contabilidad'

export const maxDuration = 60

export async function POST() {
  let empresa_id: string
  try {
    ({ empresa_id } = await getSesion())
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
  let candidatas
  try {
    candidatas = await candidatasReenvioEmpresa(empresa_id, LOTE_REENVIO + 1)
  } catch (e) {
    console.error('[admin/reenviar-contabilidad] no se pudieron leer las nóminas pendientes', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No se han podido leer las nóminas pendientes de envío. Inténtalo en un momento.' }, { status: 503 })
  }
  const r = await reenviarLote(candidatas, LOTE_REENVIO, { presupuestoMs: 45_000 })
  return NextResponse.json({ ok: true, procesadas: r.procesadas, quedan: r.quedan, por_estado: r.porEstado, resultados: r.resultados })
}
