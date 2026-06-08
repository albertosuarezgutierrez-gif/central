import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// POST: limpiadora acepta/rechaza entrada anticipada
export async function POST(req: Request) {
  const { session_id, status, early_time } = await req.json()
  try {
    await prisma.$queryRaw(Prisma.sql`
      UPDATE cleaning_sessions
      SET early_checkin_status = ${status},
          early_checkin_requested = ${early_time || null}::time
      WHERE id = ${session_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH: llamado desde /mensajes cuando huésped avisa hora salida/llegada
// Busca sesión por property_id + date, la crea si no existe
export async function PATCH(req: Request) {
  const { session_id, property_id, date, type, time } = await req.json()
  // type: 'early_checkout' | 'early_checkin_request'

  try {
    let sid = session_id

    // Si no hay session_id, buscar por property_id + date
    if (!sid && property_id) {
      const targetDate = date || new Date().toISOString().split('T')[0]
      const existing = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM cleaning_sessions
        WHERE property_id = ${property_id}
        AND session_date = ${targetDate}::date
        LIMIT 1
      `)

      if (existing.length > 0) {
        sid = existing[0].id
      } else {
        // Crear sesión automáticamente
        const created = await prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO cleaning_sessions (property_id, session_date, checkout_time, checkin_time)
          VALUES (${property_id}, ${targetDate}::date, '11:00'::time, '15:00'::time)
          RETURNING id
        `)
        sid = created[0].id
      }
    }

    if (!sid) return NextResponse.json({ error: 'No session found' }, { status: 404 })

    if (type === 'early_checkout') {
      await prisma.$queryRaw(Prisma.sql`
        UPDATE cleaning_sessions SET early_checkout_time = ${time}::time
        WHERE id = ${sid}::uuid
      `)
    } else if (type === 'early_checkin_request') {
      await prisma.$queryRaw(Prisma.sql`
        UPDATE cleaning_sessions
        SET early_checkin_requested = ${time}::time, early_checkin_status = 'pending'
        WHERE id = ${sid}::uuid
      `)
    }

    return NextResponse.json({ ok: true, session_id: sid })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
