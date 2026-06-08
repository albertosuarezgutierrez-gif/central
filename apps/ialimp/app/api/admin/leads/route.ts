import { NextResponse } from 'next/server'
import { serialize } from '@/lib/serialize'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const leads = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM leads WHERE empresa_id = ${empresa_id}::uuid
      ORDER BY creado_at DESC LIMIT 100
    `)
    const stats = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT estado, COUNT(*)::int as n FROM leads
      WHERE empresa_id = ${empresa_id}::uuid GROUP BY estado
    `)
    return NextResponse.json(serialize({ leads, stats }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id, estado, notas } = await req.json()
    await prisma.$executeRaw(Prisma.sql`
      UPDATE leads SET
        estado = COALESCE(${estado ?? null}, estado),
        notas  = COALESCE(${notas  ?? null}, notas),
        seguimiento_at = NOW()
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
