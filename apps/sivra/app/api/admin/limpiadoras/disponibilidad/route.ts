import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limpiadId = searchParams.get('limpiadora_id')

  const where = limpiadId ? Prisma.sql`WHERE ld.limpiadora_id = ${limpiadId}::uuid` : Prisma.sql``
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT ld.*, l.nombre, l.color
    FROM limpiadora_disponibilidad ld
    JOIN limpiadoras l ON l.id = ld.limpiadora_id
    ${where}
    ORDER BY l.nombre, ld.dia_semana
  `)
  return NextResponse.json({ disponibilidad: rows })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { limpiadora_id, dias } = body // dias: [{dia_semana, hora_inicio, hora_fin, horas_max, activo}]

  // Upsert masivo: borra las del limpiadora y reinserta
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM limpiadora_disponibilidad WHERE limpiadora_id = ${limpiadora_id}::uuid
  `)
  for (const d of dias) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO limpiadora_disponibilidad (limpiadora_id, dia_semana, hora_inicio, hora_fin, horas_max, activo)
      VALUES (${limpiadora_id}::uuid, ${d.dia_semana}, ${d.hora_inicio}::time, ${d.hora_fin}::time, ${d.horas_max}, ${d.activo})
      ON CONFLICT (limpiadora_id, dia_semana) DO UPDATE
        SET hora_inicio=${d.hora_inicio}::time, hora_fin=${d.hora_fin}::time,
            horas_max=${d.horas_max}, activo=${d.activo}
    `)
  }
  return NextResponse.json({ ok: true })
}
