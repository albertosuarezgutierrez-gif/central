import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

// POST — reactiva un cliente dado de baja (restaura su estado operativo).
// Las limpiezas futuras se re-sincronizan solas del iCal en la siguiente pasada del cron.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params

    const upd = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE clientes SET
        activo             = true,
        desactivado_at     = NULL,
        desactivado_por    = NULL,
        desactivado_motivo = NULL,
        updated_at         = now()
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      RETURNING id
    `)
    if (!upd.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
