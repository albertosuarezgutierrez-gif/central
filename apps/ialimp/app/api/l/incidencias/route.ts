import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getLimpiadoraSession } from '@/lib/limpiadora-auth'

// Pisos de la empresa (property_id texto) — para acotar incidencias sin columna empresa_id.
const propsDeEmpresa = (empresa_id: string) =>
  Prisma.sql`(SELECT DISTINCT property_id FROM cleaning_sessions WHERE empresa_id = ${empresa_id}::uuid)`

async function sendPushToOwner(empresa_id: string, titulo: string, urgencia: string) {
  try {
    const subs = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE empresa_id = ${empresa_id}::uuid
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
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const pid = searchParams.get('property_id')
  const estado = searchParams.get('estado') || 'abierta'

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT i.*, l.nombre as limpiadora_nombre
    FROM incidencias i
    LEFT JOIN limpiadoras l ON l.id = i.limpiadora_id
    WHERE i.estado = ${estado}
      AND (${pid}::text IS NULL OR i.property_id = ${pid})
      AND i.property_id IN ${propsDeEmpresa(sess.empresa_id)}
    ORDER BY i.created_at DESC
    LIMIT 50
  `)
  return NextResponse.json({ incidencias: rows })
}

export async function POST(req: NextRequest) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { property_id, session_id, titulo, descripcion, categoria, urgencia, photo_url } = await req.json()

  const own = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM cleaning_sessions WHERE empresa_id = ${sess.empresa_id}::uuid AND property_id = ${property_id} LIMIT 1
  `)
  if (!own.length) return NextResponse.json({ error: 'No válido' }, { status: 403 })

  const row = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO incidencias (property_id, session_id, limpiadora_id, titulo, descripcion, categoria, urgencia, estado, photo_url)
    VALUES (${property_id}, ${session_id || null}::uuid, ${sess.limpiadora_id}::uuid,
            ${titulo}, ${descripcion||null}, ${categoria||'otro'}, ${urgencia||'normal'}, 'abierta', ${photo_url||null})
    RETURNING *
  `)

  if (urgencia === 'urgente') {
    await sendPushToOwner(sess.empresa_id, titulo, urgencia)
  }

  return NextResponse.json({ incidencia: row[0] })
}

export async function PUT(req: NextRequest) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id, estado, notas_admin } = await req.json()
  await prisma.$executeRaw(Prisma.sql`
    UPDATE incidencias SET estado=${estado}, notas_admin=${notas_admin||null},
      resolved_at=${estado==='resuelta' ? new Date().toISOString() : null}::timestamptz
    WHERE id=${id}::uuid
      AND property_id IN ${propsDeEmpresa(sess.empresa_id)}
  `)
  return NextResponse.json({ ok: true })
}
