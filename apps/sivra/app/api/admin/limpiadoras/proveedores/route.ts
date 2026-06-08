import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cat = searchParams.get('categoria')
  const cond = cat ? Prisma.sql`WHERE categoria = ${cat} AND activo = true` : Prisma.sql`WHERE activo = true`
  const rows: any[] = await prisma.$queryRaw(Prisma.sql`
    SELECT p.*, 
      (SELECT COUNT(*) FROM productos pr WHERE pr.proveedor_id = p.id AND pr.activo = true) as num_productos,
      (SELECT COUNT(*) FROM pedidos pe WHERE pe.proveedor_id = p.id AND pe.estado NOT IN ('cancelado')) as num_pedidos
    FROM proveedores p
    ${cond}
    ORDER BY p.nombre
  `)
  return NextResponse.json({ proveedores: rows })
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  const row: any[] = await prisma.$queryRaw(Prisma.sql`
    INSERT INTO proveedores (nombre, empresa, telefono, email, web, whatsapp, categoria, notas)
    VALUES (${b.nombre}, ${b.empresa||null}, ${b.telefono||null}, ${b.email||null},
            ${b.web||null}, ${b.whatsapp||null}, ${b.categoria||'general'}, ${b.notas||null})
    RETURNING *
  `)
  return NextResponse.json({ proveedor: row[0] })
}

export async function PUT(req: NextRequest) {
  const b = await req.json()
  await prisma.$executeRaw(Prisma.sql`
    UPDATE proveedores SET nombre=${b.nombre}, empresa=${b.empresa||null}, telefono=${b.telefono||null},
      email=${b.email||null}, web=${b.web||null}, whatsapp=${b.whatsapp||null},
      categoria=${b.categoria||'general'}, notas=${b.notas||null}, activo=${b.activo??true}
    WHERE id = ${b.id}::uuid
  `)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await prisma.$executeRaw(Prisma.sql`UPDATE proveedores SET activo=false WHERE id=${id}::uuid`)
  return NextResponse.json({ ok: true })
}
