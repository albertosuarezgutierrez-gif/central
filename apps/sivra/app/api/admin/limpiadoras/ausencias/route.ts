import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lid = searchParams.get('limpiadora_id')
  const from = searchParams.get('from') || new Date().toISOString().split('T')[0]
  const to = searchParams.get('to') || new Date(Date.now() + 90*864e5).toISOString().split('T')[0]

  const cond = lid ? Prisma.sql`AND a.limpiadora_id = ${lid}::uuid` : Prisma.sql``
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT a.*, l.nombre, l.color
    FROM limpiadora_ausencias a
    JOIN limpiadoras l ON l.id = a.limpiadora_id
    WHERE a.fecha_fin >= ${from}::date AND a.fecha_inicio <= ${to}::date
    ${cond}
    ORDER BY a.fecha_inicio
  `)
  return NextResponse.json({ ausencias: rows })
}

export async function POST(req: NextRequest) {
  const { limpiadora_id, fecha_inicio, fecha_fin, motivo, notas } = await req.json()
  const row = await prisma.$queryRaw(Prisma.sql`
    INSERT INTO limpiadora_ausencias (limpiadora_id, fecha_inicio, fecha_fin, motivo, notas)
    VALUES (${limpiadora_id}::uuid, ${fecha_inicio}::date, ${fecha_fin}::date, ${motivo||'vacaciones'}, ${notas||null})
    RETURNING *
  `)
  return NextResponse.json({ ausencia: (row as any[])[0] })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await prisma.$executeRaw(Prisma.sql`DELETE FROM limpiadora_ausencias WHERE id = ${id}::uuid`)
  return NextResponse.json({ ok: true })
}
