import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const pid = searchParams.get('proveedor_id')
    const cond = pid ? Prisma.sql`AND pr.proveedor_id = ${pid}::uuid` : Prisma.sql``
    const rows: any[] = await prisma.$queryRaw(Prisma.sql`
      SELECT pr.*, p.nombre as proveedor_nombre, p.telefono as proveedor_tel
      FROM productos pr
      LEFT JOIN proveedores p ON p.id = pr.proveedor_id
      WHERE pr.empresa_id = ${empresa_id}::uuid
        AND pr.activo = true ${cond}
      ORDER BY pr.categoria, pr.nombre
    `)
    return NextResponse.json({ productos: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const b = await req.json()
    const row: any[] = await prisma.$queryRaw(Prisma.sql`
      INSERT INTO productos (empresa_id, proveedor_id, nombre, referencia, categoria, subcategoria, unidad, precio_unitario, iva_porcentaje, notas)
      VALUES (
        ${empresa_id}::uuid,
        ${b.proveedor_id || null}::uuid,
        ${b.nombre},
        ${b.referencia || null},
        ${b.categoria || 'limpieza'},
        ${b.subcategoria || null},
        ${b.unidad || 'unidad'},
        ${b.precio_unitario ? Number(b.precio_unitario) : null},
        ${b.iva_porcentaje || 21},
        ${b.notas || null}
      )
      RETURNING *
    `)
    return NextResponse.json({ producto: row[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const b = await req.json()
    await prisma.$executeRaw(Prisma.sql`
      UPDATE productos SET proveedor_id=${b.proveedor_id || null}::uuid,
        nombre=${b.nombre}, referencia=${b.referencia || null}, categoria=${b.categoria},
        subcategoria=${b.subcategoria || null}, unidad=${b.unidad || 'unidad'},
        precio_unitario=${b.precio_unitario ? Number(b.precio_unitario) : null},
        iva_porcentaje=${b.iva_porcentaje || 21},
        notas=${b.notas || null}, activo=${b.activo ?? true}
      WHERE id=${b.id}::uuid
        AND empresa_id=${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    await prisma.$executeRaw(Prisma.sql`
      UPDATE productos SET activo = false
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
