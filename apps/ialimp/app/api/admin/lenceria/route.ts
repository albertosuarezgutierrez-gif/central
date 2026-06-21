import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { serialize } from '@/lib/serialize'

export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const items = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT l.*, p.nombre AS propiedad_nombre,
        pr.nombre AS proveedor_nombre, pr.telefono AS proveedor_tel
      FROM lenceria l
      LEFT JOIN propiedades p  ON p.id  = l.propiedad_id
      LEFT JOIN proveedores pr ON pr.id = l.proveedor_id
      WHERE l.empresa_id = ${empresa_id}::uuid
      ORDER BY l.estado, l.tipo
    `)
    return NextResponse.json(serialize({ items }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { tipo, cantidad, propiedad_id, proveedor_id, estado, notas } = await req.json()
    if (!tipo || !cantidad) return NextResponse.json({ error: 'Tipo y cantidad obligatorios' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO lenceria (empresa_id, tipo, cantidad, propiedad_id, proveedor_id, estado, notas)
      VALUES (
        ${empresa_id}::uuid,
        ${tipo},
        ${Number(cantidad)},
        ${propiedad_id ? propiedad_id + '' : null}::uuid,
        ${proveedor_id ? proveedor_id + '' : null}::uuid,
        ${estado || 'limpio'},
        ${notas || null}
      )
    `)
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`
      UPDATE lenceria SET
        tipo         = ${b.tipo},
        cantidad     = ${Number(b.cantidad ?? 0)},
        propiedad_id = ${b.propiedad_id ? b.propiedad_id + '' : null}::uuid,
        proveedor_id = ${b.proveedor_id ? b.proveedor_id + '' : null}::uuid,
        estado       = ${b.estado || 'limpio'},
        notas        = ${b.notas || null}
      WHERE id = ${b.id}::uuid
        AND empresa_id = ${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM lenceria
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
