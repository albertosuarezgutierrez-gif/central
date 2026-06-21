import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// GET — contactos de un cliente
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const contactos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM cliente_contactos
      WHERE cliente_id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      ORDER BY principal DESC, nombre NULLS LAST
    `)
    return NextResponse.json({ contactos })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — añadir contacto (el primero del cliente queda principal automáticamente)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const { nombre, cargo, telefono, email, notas, principal, es_pagador } = await req.json()

    // El cliente debe pertenecer a esta empresa
    const chk = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM clientes WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1
    `)
    if (!chk.length) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const cnt = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM cliente_contactos WHERE cliente_id = ${id}::uuid
    `)
    const esPrincipal = principal === true || cnt[0].n === 0
    const esPagador = es_pagador === true

    if (esPrincipal) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cliente_contactos SET principal = false, updated_at = now()
        WHERE cliente_id = ${id}::uuid
      `)
    }
    if (esPagador) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cliente_contactos SET es_pagador = false, updated_at = now()
        WHERE cliente_id = ${id}::uuid
      `)
    }

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO cliente_contactos (empresa_id, cliente_id, nombre, cargo, telefono, email, notas, principal, es_pagador)
      VALUES (${empresa_id}::uuid, ${id}::uuid, ${nombre ?? null}, ${cargo ?? null},
              ${telefono ?? null}, ${email ?? null}, ${notas ?? null}, ${esPrincipal}, ${esPagador})
      RETURNING *
    `)
    return NextResponse.json({ ok: true, contacto: rows[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
