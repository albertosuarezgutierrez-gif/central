import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const property_id = searchParams.get('property_id')

  const items = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ci.* FROM checklist_items ci
    JOIN checklist_templates ct ON ct.id = ci.template_id
    WHERE ct.property_id = ${property_id} AND ct.active = true
    ORDER BY ci.frequency, ci.sort_order
  `)
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const { property_id, description, frequency, due_date } = await req.json()

  const tmpl = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM checklist_templates WHERE property_id = ${property_id} AND active = true LIMIT 1
  `)
  if (!tmpl.length) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const maxOrder = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT COALESCE(MAX(sort_order), 0) as max FROM checklist_items WHERE template_id = ${tmpl[0].id}::uuid
  `)

  await prisma.$queryRaw(Prisma.sql`
    INSERT INTO checklist_items (template_id, description, frequency, due_date, sort_order)
    VALUES (${tmpl[0].id}::uuid, ${description}, ${frequency}, ${due_date || null}::date, ${Number(maxOrder[0].max) + 1})
  `)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  const { id, active } = await req.json()
  await prisma.$queryRaw(Prisma.sql`
    UPDATE checklist_items SET active = ${active} WHERE id = ${id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
