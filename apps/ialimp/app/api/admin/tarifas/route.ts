import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const lid = new URL(req.url).searchParams.get('limpiadora_id')
  const cond = lid ? Prisma.sql`AND t.limpiadora_id = ${lid}::uuid` : Prisma.empty
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT t.*, l.nombre as limpiadora_nombre
    FROM tarifas_limpiadoras t
    JOIN limpiadoras l ON l.id = t.limpiadora_id
    WHERE t.activo = true AND t.empresa_id = ${empresa_id}::uuid ${cond}
    ORDER BY l.nombre, t.property_id
  `)
  return NextResponse.json({ tarifas: rows })
}

export async function POST(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const b = await req.json()
  const own = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM limpiadoras WHERE id = ${b.limpiadora_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1
  `)
  if (!own.length) return NextResponse.json({ error: 'Limpiadora no válida' }, { status: 403 })
  const row = await prisma.$queryRaw<any[]>(Prisma.sql`
    INSERT INTO tarifas_limpiadoras (empresa_id, limpiadora_id, property_id, tipo, importe)
    VALUES (${empresa_id}::uuid, ${b.limpiadora_id}::uuid, ${b.property_id||'__all__'}, ${b.tipo||'sesion'}, ${Number(b.importe)})
    ON CONFLICT (limpiadora_id, property_id)
    DO UPDATE SET tipo=${b.tipo||'sesion'}, importe=${Number(b.importe)}, activo=true
    RETURNING *
  `)
  return NextResponse.json({ tarifa: row[0] })
}

export async function DELETE(req: NextRequest) {
  const empresa_id = await requireEmpresaId()
  const { id } = await req.json()
  await prisma.$executeRaw(Prisma.sql`UPDATE tarifas_limpiadoras SET activo=false WHERE id=${id}::uuid AND empresa_id = ${empresa_id}::uuid`)
  return NextResponse.json({ ok: true })
}
