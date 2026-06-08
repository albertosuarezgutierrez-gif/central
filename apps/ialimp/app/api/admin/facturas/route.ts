import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const cliente_id = searchParams.get('cliente_id')
    const periodo    = searchParams.get('periodo')

    const facturas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT im.*, c.nombre AS cliente_nombre, c.contacto_email
      FROM informes_mensuales im
      JOIN clientes c ON c.id = im.cliente_id
      WHERE im.empresa_id = ${empresa_id}::uuid
        ${cliente_id ? Prisma.sql`AND im.cliente_id = ${cliente_id}::uuid` : Prisma.sql``}
        ${periodo    ? Prisma.sql`AND im.periodo = ${periodo}`              : Prisma.sql``}
      ORDER BY im.periodo DESC, c.nombre
    `)
    return NextResponse.json({ facturas })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
