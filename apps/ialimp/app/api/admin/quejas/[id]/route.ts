import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const { estado, notas_resolucion, resuelta_por } = await req.json()

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE quejas SET
        estado           = COALESCE(${estado            ?? null}, estado),
        notas_resolucion = COALESCE(${notas_resolucion  ?? null}, notas_resolucion),
        resuelta_por     = COALESCE(${resuelta_por      ?? null}, resuelta_por),
        resuelta_at      = CASE WHEN ${estado ?? ''} = 'resuelto' THEN NOW() ELSE resuelta_at END
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      RETURNING *
    `)
    if (!result.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true, queja: result[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
