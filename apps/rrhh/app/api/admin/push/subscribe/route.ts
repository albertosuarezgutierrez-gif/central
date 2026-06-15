import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'

export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const { endpoint, p256dh, auth } = await req.json().catch(() => ({}))
    if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'Suscripción incompleta' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO rrhh.push_subscriptions (empresa_id, suscriptor_tipo, endpoint, p256dh, auth)
      VALUES (${empresa_id}::uuid, 'gestor', ${endpoint}, ${p256dh}, ${auth})
      ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
