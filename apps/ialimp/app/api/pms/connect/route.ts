import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { cliente_id, cliente_nombre, pms_tipo, ical_url } = await req.json()

    if (!cliente_nombre || !pms_tipo) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    // Verificar que el cliente_id pertenece a esta empresa
    if (cliente_id) {
      const check = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM clientes
        WHERE id = ${cliente_id}::uuid AND empresa_id = ${empresa_id}::uuid
      `)
      if (!check.length) {
        return NextResponse.json({ error: 'Cliente no válido' }, { status: 403 })
      }
    }

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO pms_connections
        (empresa_id, cliente_id, cliente_nombre, pms_tipo, ical_url)
      VALUES (
        ${empresa_id}::uuid,
        ${cliente_id ? cliente_id + '::uuid' : null},
        ${cliente_nombre},
        ${pms_tipo},
        ${ical_url || null}
      )
      RETURNING id, cliente_id, cliente_nombre, pms_tipo
    `)

    const connection = result[0]

    // Sync inmediato en background si hay URL iCal
    if (ical_url) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
      fetch(appUrl + '/api/pms/sync?connection_id=' + connection.id, { method: 'GET' })
        .catch(() => {})
    }

    return NextResponse.json({ ok: true, connection }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
