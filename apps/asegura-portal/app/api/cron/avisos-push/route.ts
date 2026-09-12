import { NextResponse } from 'next/server'
import { sendWebPush } from '@central/core-push'
import { DIAS_VENTANA_AVISO, debeAvisarPush } from '@central/module-seguros-portal'
import { POLIZA_ESTADOS_VIGENTES, WHERE_CARTERA_VIVA } from '@central/module-seguros'

import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MS_DIA = 86_400_000

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
  // El rango en SQL es una CRIBA (para no traer decenas de miles de filas de golpe); quien
  // decide de verdad es `debeAvisarPush()`, más abajo — mismo patrón que
  // `apps/asegura/lib/avisos-vencimiento.ts`.
  const filas = await prisma.portalObligacion.findMany({
    where: {
      avisadaPushAt: null,
      fechaAccionable: { gte: hoy, lte: new Date(hoy.getTime() + DIAS_VENTANA_AVISO * MS_DIA) },
    },
    select: { id: true, identidadId: true, polizaId: true, titulo: true, fechaAccionable: true },
    orderBy: { fechaAccionable: 'asc' },
    take: 500,
  })
  const enVentana = filas.filter((o) => debeAvisarPush({ fechaAccionable: o.fechaAccionable, avisadaPushAt: null }, hoy))

  // 🚨 Re-comprobar que la póliza SIGUE viva: una obligación se deriva cuando el cliente entra en
  // su bóveda (`sincronizarObligacionesDeIdentidad`) y puede no volver a entrar nunca — si CIMA
  // cancela la póliza después, la fila de obligación se queda huérfana y este cron mandaría un
  // push diciéndole a alguien que decida sobre un seguro que ya no tiene. Mismo filtro que el
  // correo: cartera viva, no fusionada y en un estado vigente. Una obligación SIN póliza
  // (declarada por la persona) no pasa por aquí: sigue siendo candidata igual.
  const polizaIds = [...new Set(enVentana.map((o) => o.polizaId).filter((id): id is string => id !== null))]
  const polizasVivas = polizaIds.length
    ? await prisma.poliza.findMany({
        where: { id: { in: polizaIds }, ...WHERE_CARTERA_VIVA, mergedIntoPolizaId: null, estado: { in: [...POLIZA_ESTADOS_VIGENTES] } },
        select: { id: true },
      })
    : []
  const idsVivos = new Set(polizasVivas.map((p) => p.id))
  const debidas = enVentana.filter((o) => o.polizaId === null || idsVivos.has(o.polizaId))

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
