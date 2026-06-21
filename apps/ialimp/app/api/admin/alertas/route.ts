import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// GET — listar alertas no leídas
export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const solo_no_leidas = searchParams.get('no_leidas') !== 'false'

    const alertas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM alertas
      WHERE empresa_id = ${empresa_id}::uuid
        ${solo_no_leidas ? Prisma.sql`AND leida = false` : Prisma.sql``}
      ORDER BY creada_at DESC
      LIMIT 50
    `)

    const count = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int as total FROM alertas
      WHERE empresa_id = ${empresa_id}::uuid AND leida = false
    `)

    return NextResponse.json({ alertas, no_leidas: Number(count[0]?.total || 0) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — marcar como leída
export async function PATCH(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { ids, todas } = await req.json()

    if (todas) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE alertas SET leida = true WHERE empresa_id = ${empresa_id}::uuid
      `)
    } else if (ids?.length) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE alertas SET leida = true
        WHERE empresa_id = ${empresa_id}::uuid
          AND id = ANY(${ids}::uuid[])
      `)
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
