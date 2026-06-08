import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const pid = new URL(req.url).searchParams.get('property_id')
  if (!pid) return NextResponse.json({ error: 'property_id required' }, { status: 400 })
  const items = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ci.*, ct.name as template_name, ct.id as template_id, ct.property_id
    FROM checklist_items ci
    JOIN checklist_templates ct ON ct.id = ci.template_id
    WHERE ct.property_id = ${pid} AND ci.active = true AND ct.empresa_id = ${empresa_id}::uuid
    ORDER BY ci.sort_order NULLS LAST, ci.created_at
  `)
  const templates = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT * FROM checklist_templates WHERE property_id = ${pid} AND active = true AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ items, templates })
}

export async function POST(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const b = await req.json()
  // El template debe ser de esta empresa.
  const tpl = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM checklist_templates WHERE id = ${b.template_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1
  `)
  if (!tpl.length) return NextResponse.json({ error: 'Template no válido' }, { status: 403 })
  const row = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO checklist_items (template_id, empresa_id, description, frequency, requires_photo, es_critico, sort_order, active)
    VALUES (${b.template_id}::uuid, ${empresa_id}::uuid, ${b.description}, ${b.frequency||'per_change'},
            ${b.requires_photo||false}, ${b.es_critico||false},
            (SELECT COALESCE(MAX(sort_order),0)+10 FROM checklist_items WHERE template_id = ${b.template_id}::uuid),
            true)
    RETURNING *
  `)
  return NextResponse.json({ item: row[0] })
}

export async function PUT(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const b = await req.json()
  // Reorder: swap sort_order with adjacent item
  if (b._action === 'reorder') {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE checklist_items SET sort_order = ${b.new_sort} WHERE id = ${b.id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    if (b.swap_id) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE checklist_items SET sort_order = ${b.old_sort} WHERE id = ${b.swap_id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    }
    return NextResponse.json({ ok: true })
  }
  await prisma.$executeRaw(Prisma.sql`
    UPDATE checklist_items
    SET description = ${b.description},
        frequency = ${b.frequency||'per_change'},
        requires_photo = ${b.requires_photo||false},
        es_critico = ${b.es_critico||false},
        foto_referencia_url = ${b.foto_referencia_url||null}
    WHERE id = ${b.id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const { id } = await req.json()
  await prisma.$executeRaw(Prisma.sql`UPDATE checklist_items SET active = false WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`)
  return NextResponse.json({ ok: true })
}
