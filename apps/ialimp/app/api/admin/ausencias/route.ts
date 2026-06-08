import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const ausencias = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT la.*, l.nombre AS limpiadora_nombre, l.color AS limpiadora_color
      FROM limpiadora_ausencias la
      JOIN limpiadoras l ON l.id = la.limpiadora_id
      WHERE l.empresa_id = ${empresa_id}::uuid
      ORDER BY la.fecha_inicio DESC
    `)
    return NextResponse.json(serialize({ ausencias }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { limpiadora_id, fecha_inicio, fecha_fin, motivo, notas } = await req.json()
    if (!limpiadora_id || !fecha_inicio || !fecha_fin) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }
    // La limpiadora debe ser de esta empresa.
    const own = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM limpiadoras WHERE id = ${limpiadora_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1
    `)
    if (!own.length) return NextResponse.json({ error: 'Limpiadora no válida' }, { status: 403 })
    const row = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO limpiadora_ausencias (limpiadora_id, fecha_inicio, fecha_fin, motivo, notas, aprobada)
      VALUES (${limpiadora_id}::uuid, ${fecha_inicio}::date, ${fecha_fin}::date, ${motivo||'vacaciones'}, ${notas||null}, true)
      RETURNING *
    `)
    return NextResponse.json(serialize({ ok: true, ausencia: row[0] }), { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await req.json()
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM limpiadora_ausencias
      WHERE id = ${id}::uuid
        AND limpiadora_id IN (SELECT id FROM limpiadoras WHERE empresa_id = ${empresa_id}::uuid)
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
