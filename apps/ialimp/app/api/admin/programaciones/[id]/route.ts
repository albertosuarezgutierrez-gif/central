import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const { activa, limpiadora_id, hora_inicio, notas, fecha_fin } = await req.json()

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE programaciones SET
        activa        = COALESCE(${activa        ?? null}, activa),
        limpiadora_id = COALESCE(${limpiadora_id ? limpiadora_id + '::uuid' : null}, limpiadora_id),
        notas         = COALESCE(${notas         ?? null}, notas),
        fecha_fin     = COALESCE(${fecha_fin     ? fecha_fin + '::date' : null}, fecha_fin)
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      RETURNING *
    `)

    if (!result.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true, programacion: result[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params

    // Desactivar (no eliminar — conservar historial)
    await prisma.$executeRaw(Prisma.sql`
      UPDATE programaciones SET activa = false
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)

    // Eliminar sesiones futuras generadas por esta programación sin empezar
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM cleaning_sessions
      WHERE external_reservation_id LIKE ${'prog_' + id + '_%'}
        AND session_date >= CURRENT_DATE
        AND started_at IS NULL
    `)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
