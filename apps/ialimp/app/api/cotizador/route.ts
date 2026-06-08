import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'

// GET /api/cotizador?empresa_id=xxx — config pública del cotizador
export async function GET(req: NextRequest) {
  try {
    const empresa_id = new URL(req.url).searchParams.get('empresa_id')
    if (!empresa_id) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM cotizador_config
      WHERE empresa_id = ${empresa_id}::uuid AND activo = true LIMIT 1
    `)
    if (!rows.length) return NextResponse.json({ error: 'No configurado' }, { status: 404 })

    return NextResponse.json(serialize({ config: rows[0] }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
