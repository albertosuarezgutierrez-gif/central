import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const { estado } = await req.json()

    if (estado === 'en_lavanderia') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE lenceria SET estado = 'en_lavanderia', lavanderia_envio_at = NOW()
        WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    } else if (estado === 'limpio') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE lenceria SET estado = 'limpio', lavanderia_vuelta_at = CASE WHEN estado = 'en_lavanderia' THEN NOW() ELSE lavanderia_vuelta_at END
        WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    } else {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE lenceria SET estado = ${estado}
        WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
