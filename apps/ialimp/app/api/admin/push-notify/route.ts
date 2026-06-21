import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { limpiadora_id, titulo, cuerpo } = await req.json()

    const VAPID_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY  || ''
    const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''

    if (!VAPID_PRIVATE) {
      return NextResponse.json({
        ok: true, sent: 0,
        msg: 'VAPID no configurado. Genera claves en /api/admin/vapid-keys y añádelas a Vercel'
      })
    }

    const subs = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT endpoint, p256dh, auth_key
      FROM push_subscriptions
      WHERE empresa_id = ${empresa_id}::uuid
        ${limpiadora_id ? Prisma.sql`AND limpiadora_id = ${limpiadora_id}::uuid` : Prisma.sql``}
    `)

    if (!subs.length) return NextResponse.json({ ok: true, sent: 0, msg: 'Sin suscripciones' })

    const webpush = (await import('web-push')).default
    webpush.setVapidDetails('mailto:hola@ialimp.com', VAPID_PUBLIC, VAPID_PRIVATE)

    let sent = 0
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ title: titulo, body: cuerpo, icon: '/icon-192.png', badge: '/icon-192.png' })
        )
        sent++
      } catch (e: any) {
        if (e.statusCode === 410) {
          await prisma.$executeRaw(Prisma.sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`)
        }
      }
    }
    return NextResponse.json({ ok: true, sent })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
