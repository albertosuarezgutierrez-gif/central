import { NextResponse } from 'next/server'
import { sendWebPush } from '@central/core-push'
import { debeAvisarPush } from '@central/module-seguros-portal'

import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/cron/avisos-push — un push por obligación a punto de dejar de ser accionable, al
 * dispositivo (o dispositivos) que la identidad tenga suscritos.
 *
 * Hermano del `GET /api/cron/avisos-vencimiento` de `apps/asegura`, con el que NO comparte sello:
 * ese vive allí porque necesita el email en claro (el portal solo guarda hashes); este vive aquí
 * porque la suscripción push SÍ es suya — no hay dato personal que descifrar.
 *
 * Sin `CRON_SECRET` no se autoriza a nadie (`lib/cron-auth.ts`) y sin las claves VAPID el endpoint
 * responde 503: mandar sin ellas no es posible, así que fingir un `{avisadas:0}` sería la misma
 * mentira que un catch que devuelve `[]`.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return NextResponse.json({ estado: 'error', causa: 'sin_vapid' }, { status: 503 })
  }
  const vapid = { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: 'mailto:hola@grupoasegura.es' }

  const hoy = new Date()
  const candidatas = await prisma.portalObligacion.findMany({
    where: { avisadaPushAt: null },
    select: { id: true, identidadId: true, titulo: true, fechaAccionable: true },
  })
  const debidas = candidatas.filter((o) => debeAvisarPush({ fechaAccionable: o.fechaAccionable, avisadaPushAt: null }, hoy))

  let avisadas = 0
  let sinSuscripcion = 0
  let sinExito = 0

  for (const o of debidas) {
    const subs = await prisma.portalPushSuscripcion.findMany({ where: { identidadId: o.identidadId } })
    if (subs.length === 0) {
      sinSuscripcion += 1
      continue
    }

    const payload = {
      title: 'Tu seguro pide una decisión',
      body: `${o.titulo}: te queda poco margen para decidir si lo renuevas.`,
      icon: '/icono-app',
      data: { url: '/boveda' },
    }

    let algunaOk = false
    for (const s of subs) {
      const res = await sendWebPush(vapid, { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.authKey } }, payload)
      if (res.ok) algunaOk = true
      // Suscripción muerta (404/410): se borra para no seguir intentando en cada pasada.
      if (res.gone) await prisma.portalPushSuscripcion.delete({ where: { id: s.id } }).catch(() => {})
    }

    // Se sella SOLO si al menos un envío se aceptó (mismo criterio que `avisada_at` del correo):
    // si todos fallaron (red, proveedor caído) se reintenta en la siguiente pasada, no se finge un
    // envío que no salió.
    if (algunaOk) {
      await prisma.portalObligacion.update({ where: { id: o.id }, data: { avisadaPushAt: new Date() } })
      avisadas += 1
    } else {
      sinExito += 1
    }
  }

  return NextResponse.json({ estado: 'ok', candidatas: debidas.length, avisadas, sinSuscripcion, sinExito })
}
