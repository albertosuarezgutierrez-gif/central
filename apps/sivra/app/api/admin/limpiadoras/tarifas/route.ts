import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const lid = new URL(req.url).searchParams.get('limpiadora_id')
  const cond = lid ? Prisma.sql`WHERE t.limpiadora_id = ${lid}::uuid AND t.activo = true` : Prisma.sql`WHERE t.activo = true`
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT t.*, l.nombre as limpiadora_nombre
    FROM tarifas_limpiadoras t
    JOIN limpiadoras l ON l.id = t.limpiadora_id
    ${cond}
    ORDER BY l.nombre, t.property_id
  `)
  return NextResponse.json({ tarifas: rows })
}

export async function POST(req: NextRequest) {
  const b = await req.json()
  const row = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO tarifas_limpiadoras (limpiadora_id, property_id, tipo, importe)
    VALUES (${b.limpiadora_id}::uuid, ${b.property_id||'__all__'}, ${b.tipo||'sesion'}, ${Number(b.importe)})
    ON CONFLICT (limpiadora_id, property_id)
    DO UPDATE SET tipo=${b.tipo||'sesion'}, importe=${Number(b.importe)}, activo=true
    RETURNING *
  `)
  return NextResponse.json({ tarifa: row[0] })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await prisma.$executeRaw(Prisma.sql`UPDATE tarifas_limpiadoras SET activo=false WHERE id=${id}::uuid`)
  return NextResponse.json({ ok: true })
}
