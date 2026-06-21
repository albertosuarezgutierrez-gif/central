import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const { sesion_id, firma_svg, firmante_nombre } = await req.json()

    const clientes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM clientes WHERE access_token = ${token}
    `)
    if (!clientes.length) return NextResponse.json({ error: 'Token inválido' }, { status: 403 })

    await prisma.$executeRaw(Prisma.sql`
      UPDATE cleaning_sessions SET
        firma_cliente_svg    = ${firma_svg},
        firma_cliente_nombre = ${firmante_nombre || 'Cliente'},
        firma_at             = NOW()
      WHERE id = ${sesion_id}::uuid AND cliente_id = ${clientes[0].id}::uuid
    `)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
