import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// GET — plantillas de la empresa
export async function GET() {
  const empresa_id = await requireEmpresaId()
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id::text, tipo, nombre, items, activa, updated_at
    FROM repartidor_checklist_plantillas
    WHERE empresa_id = ${empresa_id}::uuid
    ORDER BY tipo, nombre
  `)
  return NextResponse.json({ plantillas: rows })
}

// POST — crear plantilla
export async function POST(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { tipo, nombre, items } = await req.json()
  if (!tipo || !nombre) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const row = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO repartidor_checklist_plantillas (empresa_id, tipo, nombre, items)
    VALUES (${empresa_id}::uuid, ${tipo}, ${nombre}, ${JSON.stringify(items || [])}::jsonb)
    RETURNING id::text, tipo, nombre, items, activa
  `)
  return NextResponse.json({ plantilla: row[0] }, { status: 201 })
}

// PATCH — actualizar plantilla
export async function PATCH(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { id, nombre, items, activa } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  await prisma.$executeRaw(Prisma.sql`
    UPDATE repartidor_checklist_plantillas SET
      nombre     = COALESCE(${nombre || null}, nombre),
      items      = COALESCE(${items != null ? JSON.stringify(items) : null}::jsonb, items),
      activa     = COALESCE(${activa ?? null}, activa),
      updated_at = now()
    WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ ok: true })
}

// DELETE — borrar plantilla
export async function DELETE(req: Request) {
  const empresa_id = await requireEmpresaId()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM repartidor_checklist_plantillas
    WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
