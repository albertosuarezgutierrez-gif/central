import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// DELETE /api/admin/escanear/:id — soft-delete (activo=false), scoped por empresa
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE documentos_contables
      SET activo = false
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid AND activo = true
      RETURNING id
    `)

    if (!rows.length) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true, id: rows[0].id })
  } catch (e: any) {
    console.error('[escanear DELETE]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
