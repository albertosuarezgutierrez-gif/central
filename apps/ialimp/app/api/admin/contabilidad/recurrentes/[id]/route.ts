import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// DELETE /api/admin/contabilidad/recurrentes/[id]
// Desactiva una plantilla recurrente (soft). No borra los apuntes ya generados.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params

    const res = await prisma.$executeRaw(Prisma.sql`
      UPDATE apuntes_recurrentes
      SET activo = false
      WHERE id = ${id}::uuid
        AND empresa_id = ${empresa_id}::uuid
    `)

    if (res === 0) return NextResponse.json({ error: 'Recurrente no encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
