import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { sendWebPush } from '@central/core-push'

/**
 * Envía una notificación web-push a todas las suscripciones de una limpiadora.
 * No crítico: si faltan claves VAPID o no hay suscripciones, no hace nada.
 * Scope por empresa_id (frontera multi-tenant). El envío en sí lo hace el núcleo
 * compartido `@central/core-push`; aquí queda el scope, el payload y el borrado.
 */
export async function sendPushToLimpiadora(
  empresa_id: string,
  limpiadora_id: string,
  titulo: string,
  cuerpo: string,
) {
  try {
    const VAPID_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
    const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
    if (!VAPID_PRIVATE || !limpiadora_id) return

    const subs = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT endpoint, p256dh, auth_key
      FROM push_subscriptions
      WHERE empresa_id = ${empresa_id}::uuid
        AND limpiadora_id = ${limpiadora_id}::uuid
    `)
    if (!subs.length) return

    const vapid = { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: 'mailto:hola@ialimp.com' }
    const payload = { title: titulo, body: cuerpo, icon: '/icon-192.png', badge: '/icon-192.png' }

    for (const sub of subs) {
      const res = await sendWebPush(
        vapid,
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload,
      )
      if (res.gone) {
        await prisma.$executeRaw(Prisma.sql`
          DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}
        `)
      }
    }
  } catch (_) { /* push no crítico */ }
}
