import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const cat = searchParams.get('categoria')
    const cond = cat
      ? Prisma.sql`AND p.categoria = ${cat} AND p.activo = true`
      : Prisma.sql`AND p.activo = true`
    const rows: any[] = await prisma.$queryRaw(Prisma.sql`
      SELECT p.*,
        (SELECT COUNT(*)::int FROM productos pr WHERE pr.proveedor_id = p.id AND pr.activo = true) as num_productos,
        (SELECT COUNT(*)::int FROM pedidos pe WHERE pe.proveedor_id = p.id AND pe.estado NOT IN ('cancelado')) as num_pedidos
      FROM proveedores p
      WHERE p.empresa_id = ${empresa_id}::uuid ${cond}
      ORDER BY p.nombre
    `)
    return NextResponse.json(serialize({ proveedores: rows }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const b = await req.json()
  const row: any[] = await prisma.$queryRaw(Prisma.sql`
    INSERT INTO proveedores (empresa_id, nombre, empresa, telefono, email, web, whatsapp, categoria, notas)
    VALUES (${empresa_id}::uuid, ${b.nombre}, ${b.empresa||null}, ${b.telefono||null}, ${b.email||null},
            ${b.web||null}, ${b.whatsapp||null}, ${b.categoria||'general'}, ${b.notas||null})
    RETURNING *
  `)
  return NextResponse.json({ proveedor: row[0] })
}

export async function PUT(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const b = await req.json()
  await prisma.$executeRaw(Prisma.sql`
    UPDATE proveedores SET nombre=${b.nombre}, empresa=${b.empresa||null}, telefono=${b.telefono||null},
      email=${b.email||null}, web=${b.web||null}, whatsapp=${b.whatsapp||null},
      categoria=${b.categoria||'general'}, notas=${b.notas||null}, activo=${b.activo??true}
    WHERE id = ${b.id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const { id } = await req.json()
  await prisma.$executeRaw(Prisma.sql`UPDATE proveedores SET activo=false WHERE id=${id}::uuid AND empresa_id = ${empresa_id}::uuid`)
  return NextResponse.json({ ok: true })
}
