import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pid = searchParams.get('property_id')
  const cond = pid ? Prisma.sql`AND property_id = ${pid}` : Prisma.sql``
  const items: any[] = await prisma.$queryRaw(Prisma.sql`
    SELECT *, 
      (cantidad_total - cantidad_disponible - cantidad_lavanderia - cantidad_sucia) as cantidad_perdida
    FROM lenceria_items
    WHERE activo = true ${cond}
    ORDER BY property_id, tipo, talla
  `)
  const envios: any[] = await prisma.$queryRaw(Prisma.sql`
    SELECT e.*, p.nombre as proveedor_nombre
    FROM lenceria_envios e
    LEFT JOIN proveedores p ON p.id = e.proveedor_id
    ORDER BY e.fecha DESC LIMIT 20
  `)
  return NextResponse.json({ items, envios })
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  if (b._type === 'envio') {
    const row: any[] = await prisma.$queryRaw(Prisma.sql`
      INSERT INTO lenceria_envios (property_id, proveedor_id, tipo, fecha, bultos, kg_estimados, coste, notas)
      VALUES (${b.property_id||null}, ${b.proveedor_id ? b.proveedor_id + '::uuid' : null}::uuid,
              ${b.tipo||'envio'}, ${b.fecha}::date, ${b.bultos||null}, ${b.kg_estimados||null}, ${b.coste||null}, ${b.notas||null})
      RETURNING *
    `)
    return NextResponse.json({ envio: row[0] })
  }
  const row: any[] = await prisma.$queryRaw(Prisma.sql`
    INSERT INTO lenceria_items (property_id, tipo, talla, cantidad_total, cantidad_disponible, cantidad_lavanderia, cantidad_sucia, fecha_compra, coste_unidad, vida_util_meses, notas)
    VALUES (${b.property_id}, ${b.tipo}, ${b.talla||null}, ${b.cantidad_total||0}, ${b.cantidad_disponible||0},
            ${b.cantidad_lavanderia||0}, ${b.cantidad_sucia||0}, ${b.fecha_compra||null}::date,
            ${b.coste_unidad||null}, ${b.vida_util_meses||24}, ${b.notas||null})
    RETURNING *
  `)
  return NextResponse.json({ item: row[0] })
}

export async function PUT(req: NextRequest) {
  const b = await req.json()
  await prisma.$executeRaw(Prisma.sql`
    UPDATE lenceria_items SET
      cantidad_disponible=${b.cantidad_disponible}, cantidad_lavanderia=${b.cantidad_lavanderia},
      cantidad_sucia=${b.cantidad_sucia}, notas=${b.notas||null}
    WHERE id=${b.id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
