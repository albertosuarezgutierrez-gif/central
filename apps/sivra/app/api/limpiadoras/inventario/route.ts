import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const property_id = searchParams.get('property_id')

  const items = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT i.*,
      (SELECT json_agg(a ORDER BY a.created_at DESC)
       FROM inventario_alertas a WHERE a.inventario_id = i.id AND a.resuelta = false
      ) as alertas_pendientes
    FROM inventario i
    WHERE (${property_id}::text IS NULL OR i.property_id = ${property_id})
    AND i.activo = true
    ORDER BY i.categoria, i.articulo
  `)
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const { inventario_id, session_id, limpiadora_id, cantidad_reportada, nota } = await req.json()
  await prisma.$queryRaw(Prisma.sql`
    INSERT INTO inventario_alertas (inventario_id, session_id, limpiadora_id, cantidad_reportada, nota)
    VALUES (${inventario_id}::uuid, ${session_id || null}::uuid,
            ${limpiadora_id || null}::uuid, ${cantidad_reportada || 0}, ${nota || null})
  `)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  const { id, stock_actual } = await req.json()
  await prisma.$queryRaw(Prisma.sql`
    UPDATE inventario SET stock_actual = ${stock_actual} WHERE id = ${id}::uuid
  `)
  await prisma.$queryRaw(Prisma.sql`
    UPDATE inventario_alertas SET resuelta = true WHERE inventario_id = ${id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
