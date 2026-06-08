import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function POST(req: Request) {
  const body = await req.json()
  const { session_id, item_id, item_description, checked, photo_url, photo_url_2, photo_url_3, notes } = body

  try {
    if (item_id === 'finish') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions
        SET completed_at = COALESCE(completed_at, now()),
            hora_salida = COALESCE(hora_salida, now())
        WHERE id = ${session_id}::uuid
      `)
      return NextResponse.json({ ok: true, finished: true })
    }

    const existing = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM session_completions
      WHERE session_id = ${session_id}::uuid AND item_id = ${item_id}::uuid LIMIT 1
    `)

    if (existing.length > 0) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE session_completions
        SET checked = ${checked},
            photo_url   = COALESCE(${photo_url??null},   photo_url),
            photo_url_2 = COALESCE(${photo_url_2??null}, photo_url_2),
            photo_url_3 = COALESCE(${photo_url_3??null}, photo_url_3),
            notes = ${notes??null},
            completed_at = ${checked ? new Date().toISOString() : null}::timestamptz
        WHERE session_id = ${session_id}::uuid AND item_id = ${item_id}::uuid
      `)
    } else {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO session_completions
          (session_id, item_id, item_description, checked, photo_url, photo_url_2, photo_url_3, notes, completed_at)
        VALUES (${session_id}::uuid, ${item_id}::uuid, ${item_description??''},
                ${checked}, ${photo_url??null}, ${photo_url_2??null}, ${photo_url_3??null},
                ${notes??null}, ${checked ? new Date().toISOString() : null}::timestamptz)
      `)
    }

    if (checked) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE checklist_items SET last_completed_at = now() WHERE id = ${item_id}::uuid
      `)
      // Auto hora_llegada si aún no está
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions
        SET hora_llegada = COALESCE(hora_llegada, now())
        WHERE id = ${session_id}::uuid
      `)
    }

    const progress = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE sc.checked = true) as done, COUNT(*) as total
      FROM checklist_items ci
      JOIN checklist_templates ct ON ct.id = ci.template_id
      JOIN cleaning_sessions cs ON cs.property_id = ct.property_id AND cs.id = ${session_id}::uuid
      LEFT JOIN session_completions sc ON sc.item_id = ci.id AND sc.session_id = ${session_id}::uuid
      WHERE ci.active = true
    `)

    const { done, total } = progress[0] || {}
    return NextResponse.json({ ok: true, progress: { done: Number(done), total: Number(total) } })
  } catch (e: any) {
    console.error('complete error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
