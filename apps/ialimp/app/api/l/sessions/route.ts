import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  const days = parseInt(searchParams.get('days') || '14')

  // Calculate date range
  let dateFrom: string, dateTo: string
  if (from && to) {
    dateFrom = from; dateTo = to
  } else if (date) {
    dateFrom = date; dateTo = date
  } else {
    const today = new Date()
    dateFrom = today.toISOString().split('T')[0]
    dateTo = new Date(today.getTime() + days * 86400000).toISOString().split('T')[0]
  }

  try {
    const sessions = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT 
        cs.*,
        l.nombre as limpiadora_nombre,
        ct.id as template_id,
        json_agg(
          json_build_object(
            'id', ci.id,
            'description', ci.description,
            'frequency', ci.frequency,
            'sort_order', ci.sort_order
          ) ORDER BY ci.sort_order
        ) FILTER (WHERE ci.id IS NOT NULL) as checklist_items,
        (
          SELECT json_agg(json_build_object(
            'item_id', sc.item_id,
            'checked', sc.checked,
            'photo_url', sc.photo_url, sc.photo_url_2, sc.photo_url_3
          ))
          FROM session_completions sc WHERE sc.session_id = cs.id
        ) as completions
      FROM cleaning_sessions cs
      LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
      LEFT JOIN checklist_templates ct ON ct.property_id = cs.property_id AND ct.active = true
      LEFT JOIN checklist_items ci ON ci.template_id = ct.id AND ci.active = true
      WHERE cs.session_date >= ${dateFrom}::date
        AND cs.session_date <= ${dateTo}::date
      GROUP BY cs.id, ct.id, l.nombre
      ORDER BY cs.session_date ASC, cs.checkout_time ASC
    `)
    return NextResponse.json({ sessions })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { property_id, reservation_id, guest_out, guest_in, checkout_time, checkin_time, session_date } = body
  try {
    const existing = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM cleaning_sessions
      WHERE property_id = ${property_id}
      AND session_date = ${session_date || new Date().toISOString().split('T')[0]}::date
      LIMIT 1
    `)
    if (existing.length > 0) return NextResponse.json({ session: existing[0], created: false })
    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO cleaning_sessions (property_id, reservation_id, guest_out, guest_in, checkout_time, checkin_time, session_date)
      VALUES (${property_id}, ${reservation_id||null}, ${guest_out||null}, ${guest_in||null},
              ${checkout_time||'11:00'}::time, ${checkin_time||'15:00'}::time,
              ${session_date||new Date().toISOString().split('T')[0]}::date)
      RETURNING *
    `)
    return NextResponse.json({ session: result[0], created: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
