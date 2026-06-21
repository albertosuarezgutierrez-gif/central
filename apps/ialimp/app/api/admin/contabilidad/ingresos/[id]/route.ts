import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// DELETE /api/admin/contabilidad/ingresos/[id]
// Borra (soft delete) un ingreso manual de la empresa.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params

    const res = await prisma.$executeRaw(Prisma.sql`
      UPDATE ingresos_manuales
      SET activo = false
      WHERE id = ${id}::uuid
        AND empresa_id = ${empresa_id}::uuid
    `)

    if (res === 0) return NextResponse.json({ error: 'Ingreso no encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
