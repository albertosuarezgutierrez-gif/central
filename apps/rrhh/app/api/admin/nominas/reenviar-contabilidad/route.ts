/**
 * «Reintentar envío a contabilidad» del responsable: envía YA la cola del outbox `rrhh.hechos_nominas` de SU empresa (la de getSesion(),
 * nunca de la petición), estados 'pendiente' y 'error', sin esperar al `proximo_intento`. Lo 'rechazado' no se reintenta solo.
 * Mismo envío que el cron `/api/cron/enviar-hechos-nominas` (`enviarHechosNominas`); idempotente por ref `nomina:<id>`.
 * Lote de 25; si llega uno de más, `quedan: true` y se vuelve a pulsar.
 */
import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { enviarHechosNominas, leerConfigContabilidad } from '@/lib/enviar-hechos-nominas'
import { leerColaHechosNominasEmpresa, marcarHechoNomina } from '@/lib/hechos-nominas'

export const maxDuration = 60
const LOTE = 25

export async function POST() {
  let empresa_id: string
  try {
    ({ empresa_id } = await getSesion())
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
  let cola
  try {
    cola = await leerColaHechosNominasEmpresa(empresa_id, LOTE + 1)
  } catch (e) {
    console.error('[admin/reenviar-contabilidad] no se pudo leer la cola', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No se han podido leer los envíos pendientes. Inténtalo en un momento.' }, { status: 503 })
  }
  const config = leerConfigContabilidad()
  if (!config) return NextResponse.json({ error: 'La conexión con contabilidad no está configurada: los envíos siguen pendientes.' }, { status: 503 })
  const r = await enviarHechosNominas({
    config,
    leerCola: async () => cola.slice(0, LOTE),
    marcar: marcarHechoNomina,
    fetch: (url, init) => fetch(url, init),
    ahora: () => new Date(),
    limite: LOTE,
    timeoutMs: 2_000, // 25 × 2 s cabe en maxDuration; lo que tarde más queda en 'error' y lo reintenta el cron (15 s)
  })
  const procesadas = r.enviados + r.rechazados + r.errores
  return NextResponse.json({
    ok: true, procesadas, quedan: cola.length > LOTE || r.aplazados > 0,
    por_estado: Object.fromEntries(Object.entries({ enviado: r.enviados, rechazado: r.rechazados, error: r.errores, aplazado: r.aplazados }).filter(([, n]) => n > 0)),
  })
}
