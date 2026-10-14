import { NextResponse } from 'next/server'
import { sendWebPush } from '@central/core-push'

import { prisma } from '@/lib/db'
import { PAYLOAD_PRUEBA, PRUEBA_PUSH_MAX, PRUEBA_PUSH_VENTANA_MS, respuestaDePrueba } from '@/lib/push-prueba'
import { OPCIONES_AVISO, cargarVapid } from '@/lib/push-vapid'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/push/prueba — «Enviar aviso de prueba» de Configuración: un push de texto fijo SOLO a las
 * suscripciones de la identidad de la sesión. Sin cuerpo: ningún id entra por la request.
 * Limitador en memoria (por instancia, best-effort) para que no se use de metralleta.
 * El 404/410 borra la suscripción caducada, igual que `avisos-push`. El corredor queda vetado por `middleware.ts`.
 */
export async function POST() {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const tope = rateLimit(`push-prueba:${identidad.id}`, PRUEBA_PUSH_MAX, PRUEBA_PUSH_VENTANA_MS)
  if (!tope.allowed) {
    const retryAfter = tope.retryAfter ?? 60
    return NextResponse.json({ error: 'demasiadas_peticiones', retryAfter }, { status: 429, headers: { 'retry-after': String(retryAfter) } })
  }

  const cargada = await cargarVapid()
  if (!cargada.ok) return NextResponse.json({ error: 'sin_vapid' }, { status: 503 })

  const subs = await prisma.portalPushSuscripcion.findMany({ where: { identidadId: identidad.id } })
  if (subs.length === 0) return NextResponse.json({ error: 'sin_suscripciones' }, { status: 409 })

  const resultados: Array<{ ok: boolean }> = []
  for (const s of subs) {
    const res = await sendWebPush(cargada.vapid, { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.authKey } }, PAYLOAD_PRUEBA, OPCIONES_AVISO)
    resultados.push({ ok: res.ok })
    if (res.gone) {
      await prisma.portalPushSuscripcion.deleteMany({ where: { id: s.id, identidadId: identidad.id } }).catch(() => {})
    }
  }

  const r = respuestaDePrueba(resultados)
  return NextResponse.json(r.cuerpo, { status: r.status })
}
