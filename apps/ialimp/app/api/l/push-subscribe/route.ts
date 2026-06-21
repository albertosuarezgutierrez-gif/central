import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

async function getLimpiadora() {
  const jar   = await cookies()
  const token = jar.get('limpiadora_token')?.value
  if (!token) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.limpiadora_id::text AS id, l.empresa_id::text, l.nombre
    FROM limpiadora_sessions s
    JOIN limpiadoras l ON l.id = s.limpiadora_id
    WHERE s.token = ${token}
      AND l.empresa_id IS NOT NULL
      AND s.expires_at > NOW()
    LIMIT 1
  `)
  return rows[0] || null
}

export async function POST(req: Request) {
  try {
    const limp = await getLimpiadora()
    if (!limp) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { endpoint, p256dh, auth } = await req.json()
    if (!endpoint) return NextResponse.json({ error: 'endpoint requerido' }, { status: 400 })

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO push_subscriptions (empresa_id, limpiadora_id, endpoint, p256dh, auth_key)
      VALUES (
        ${limp.empresa_id}::uuid,
        ${limp.id}::uuid,
        ${endpoint},
        ${p256dh},
        ${auth}
      )
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh        = EXCLUDED.p256dh,
        auth_key      = EXCLUDED.auth_key,
        limpiadora_id = EXCLUDED.limpiadora_id
    `)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
