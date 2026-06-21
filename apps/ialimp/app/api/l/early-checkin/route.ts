import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getLimpiadoraSession } from '@/lib/limpiadora-auth'

// POST: limpiadora acepta/rechaza entrada anticipada
export async function POST(req: Request) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { session_id, status, early_time } = await req.json()
  try {
    await prisma.$queryRaw(Prisma.sql`
      UPDATE cleaning_sessions
      SET early_checkin_status = ${status},
          early_checkin_requested = ${early_time || null}::time
      WHERE id = ${session_id}::uuid AND empresa_id = ${sess.empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH: busca sesión por property_id + date (acotado a la empresa), la actualiza.
export async function PATCH(req: Request) {
  const sess = await getLimpiadoraSession()
  if (!sess) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { session_id, property_id, date, type, time } = await req.json()

  try {
    let sid = session_id

    if (!sid && property_id) {
      const targetDate = date || new Date().toISOString().split('T')[0]
      const existing = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM cleaning_sessions
        WHERE property_id = ${property_id}
        AND session_date = ${targetDate}::date
        AND empresa_id = ${sess.empresa_id}::uuid
        LIMIT 1
      `)
      if (existing.length > 0) sid = existing[0].id
      else return NextResponse.json({ error: 'No session found' }, { status: 404 })
    }

    if (!sid) return NextResponse.json({ error: 'No session found' }, { status: 404 })

    if (type === 'early_checkout') {
      await prisma.$queryRaw(Prisma.sql`
        UPDATE cleaning_sessions SET early_checkout_time = ${time}::time
        WHERE id = ${sid}::uuid AND empresa_id = ${sess.empresa_id}::uuid
      `)
    } else if (type === 'early_checkin_request') {
      await prisma.$queryRaw(Prisma.sql`
        UPDATE cleaning_sessions
        SET early_checkin_requested = ${time}::time, early_checkin_status = 'pending'
        WHERE id = ${sid}::uuid AND empresa_id = ${sess.empresa_id}::uuid
      `)
    }

    return NextResponse.json({ ok: true, session_id: sid })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
