import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Horas derivadas del turno (las consume el cron auto-assign vía hora_inicio/hora_fin)
const HORAS: Record<string, { inicio: string; fin: string }> = {
  'mañana':   { inicio: '08:00', fin: '14:00' },
  'tarde':    { inicio: '14:00', fin: '20:00' },
  'completo': { inicio: '08:00', fin: '20:00' },
}

export async function GET(req: NextRequest) {
  const empresaId = await requireEmpresaId()
  const { searchParams } = new URL(req.url)
  const limpiadId = searchParams.get('limpiadora_id')

  const where = limpiadId
    ? Prisma.sql`WHERE ld.limpiadora_id = ${limpiadId}::uuid AND l.empresa_id = ${empresaId}::uuid`
    : Prisma.sql`WHERE l.empresa_id = ${empresaId}::uuid`

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT ld.*, l.nombre, l.color
    FROM limpiadora_disponibilidad ld
    JOIN limpiadoras l ON l.id = ld.limpiadora_id
    ${where}
    ORDER BY l.nombre, ld.dia_semana, ld.turno
  `)
  return NextResponse.json({ disponibilidad: rows })
}

export async function POST(req: NextRequest) {
  const empresaId = await requireEmpresaId()
  const { limpiadora_id, dia_semana, turno } = await req.json()

  if (!limpiadora_id || dia_semana == null || !HORAS[turno]) {
    return NextResponse.json({ error: 'datos inválidos' }, { status: 400 })
  }

  // La limpiadora debe pertenecer a la empresa de la sesión
  const ok = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM limpiadoras
    WHERE id = ${limpiadora_id}::uuid AND empresa_id = ${empresaId}::uuid
    LIMIT 1
  `)
  if (!ok.length) return NextResponse.json({ error: 'no autorizado' }, { status: 403 })

  const h = HORAS[turno]
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO limpiadora_disponibilidad
      (limpiadora_id, dia_semana, turno, hora_inicio, hora_fin, activo)
    VALUES
      (${limpiadora_id}::uuid, ${dia_semana}, ${turno}, ${h.inicio}::time, ${h.fin}::time, true)
    ON CONFLICT (limpiadora_id, dia_semana, turno) DO UPDATE
      SET hora_inicio = ${h.inicio}::time, hora_fin = ${h.fin}::time, activo = true
  `)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const empresaId = await requireEmpresaId()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Borra solo si la fila es de una limpiadora de esta empresa
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM limpiadora_disponibilidad ld
    USING limpiadoras l
    WHERE ld.id = ${id}::uuid
      AND ld.limpiadora_id = l.id
      AND l.empresa_id = ${empresaId}::uuid
  `)
  return NextResponse.json({ ok: true })
}
