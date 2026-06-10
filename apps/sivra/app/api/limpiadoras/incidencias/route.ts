import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { isLimpiadoraAuthorized } from '@/lib/limpiadora-auth'

async function sendPushToOwner(titulo: string, urgencia: string) {
  try {
    const subs = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id = 'alberto'
    `)
    if (!subs.length) return

    const payload = JSON.stringify({
      title: urgencia === 'urgente' ? '🔴 Incidencia URGENTE' : '⚠️ Nueva incidencia',
      body: titulo,
      icon: '/icon-192.png',
    })

    for (const sub of subs) {
      try {
        await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'TTL': '60',
          },
          body: payload,
        })
      } catch { /* silently ignore push errors */ }
    }
  } catch { /* silently ignore */ }
}

export async function GET(req: NextRequest) {
  if (!(await isLimpiadoraAuthorized())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const pid = searchParams.get('property_id')
  const estado = searchParams.get('estado') || 'abierta'
  const cond = pid
    ? Prisma.sql`WHERE i.property_id = ${pid} AND i.estado = ${estado}`
    : Prisma.sql`WHERE i.estado = ${estado}`

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT i.*, l.nombre as limpiadora_nombre
    FROM incidencias i
    LEFT JOIN limpiadoras l ON l.id = i.limpiadora_id
    ${cond}
    ORDER BY i.created_at DESC
    LIMIT 50
  `)
  return NextResponse.json({ incidencias: rows })
}

export async function POST(req: NextRequest) {
  if (!(await isLimpiadoraAuthorized())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { property_id, session_id, limpiadora_id, titulo, descripcion, categoria, urgencia, photo_url } = await req.json()

  const row = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO incidencias (property_id, session_id, limpiadora_id, titulo, descripcion, categoria, urgencia, estado, photo_url)
    VALUES (${property_id}, ${session_id ? session_id + '::uuid' : null}::uuid,
            ${limpiadora_id ? limpiadora_id + '::uuid' : null}::uuid,
            ${titulo}, ${descripcion||null}, ${categoria||'otro'}, ${urgencia||'normal'}, 'abierta', ${photo_url||null})
    RETURNING *
  `)

  if (urgencia === 'urgente') {
    await sendPushToOwner(titulo, urgencia)
  }

  return NextResponse.json({ incidencia: row[0] })
}

export async function PUT(req: NextRequest) {
  if (!(await isLimpiadoraAuthorized())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id, estado, notas_admin } = await req.json()
  await prisma.$executeRaw(Prisma.sql`
    UPDATE incidencias SET estado=${estado}, notas_admin=${notas_admin||null},
      resolved_at=${estado==='resuelta' ? new Date().toISOString() : null}::timestamptz
    WHERE id=${id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
