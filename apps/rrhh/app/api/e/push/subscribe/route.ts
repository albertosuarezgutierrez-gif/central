import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'

export async function POST(req: Request) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const { endpoint, p256dh, auth } = await req.json().catch(() => ({}))
    if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'Suscripción incompleta' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO rrhh.push_subscriptions (empresa_id, suscriptor_tipo, suscriptor_id, endpoint, p256dh, auth)
      VALUES (${empresa_id}::uuid, 'titular', ${empleado_id}::uuid, ${endpoint}, ${p256dh}, ${auth})
      ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, suscriptor_id = ${empleado_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
