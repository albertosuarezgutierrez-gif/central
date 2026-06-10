import { sendWebPush } from "@iarest/core-push"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

// Envío de Web Push al PROPIETARIO (scope user_id='alberto' en push_subscriptions, que es el
// default de la tabla). Espejo de apps/ialimp/lib/push.ts. "Best effort": nunca lanza.
const OWNER = "alberto"

export async function sendOwnerPush(title: string, body: string, url = "/pricing-auto"): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID no configurado (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)")
    return
  }

  const subs = await prisma.$queryRaw<{
    endpoint: string; p256dh: string | null; auth_key: string | null; subscription: string | null
  }[]>(Prisma.sql`
    SELECT endpoint, p256dh, auth_key, subscription
    FROM push_subscriptions WHERE user_id = ${OWNER}
  `).catch(() => [])

  const vapid = { publicKey, privateKey, subject: "mailto:alberto.suarez.gutierrez@gmail.com" }
  const payload = JSON.stringify({ title, body, url })

  for (const s of subs) {
    let sub: { endpoint: string; keys: { p256dh: string; auth: string } } | null = null
    if (s.p256dh && s.auth_key) {
      sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }
    } else if (s.subscription) {
      try { sub = JSON.parse(s.subscription) } catch { continue }
    }
    if (!sub) continue
    const res = await sendWebPush(vapid, sub, payload)
    if (res.gone) {
      await prisma.$executeRaw(Prisma.sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`).catch(() => {})
    }
  }
}
