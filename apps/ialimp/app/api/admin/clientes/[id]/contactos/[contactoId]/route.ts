import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// PATCH — editar contacto
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; contactoId: string }> }
) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id, contactoId } = await params
    const { nombre, cargo, telefono, email, notas, principal, es_pagador } = await req.json()

    // El contacto debe pertenecer a este cliente y empresa
    const chk = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM cliente_contactos
      WHERE id = ${contactoId}::uuid AND cliente_id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      LIMIT 1
    `)
    if (!chk.length) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    // Marcar principal desmarca a los demás del mismo cliente
    if (principal === true) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cliente_contactos SET principal = false, updated_at = now()
        WHERE cliente_id = ${id}::uuid AND id <> ${contactoId}::uuid
      `)
    }
    // Marcar pagador desmarca a los demás del mismo cliente
    if (es_pagador === true) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cliente_contactos SET es_pagador = false, updated_at = now()
        WHERE cliente_id = ${id}::uuid AND id <> ${contactoId}::uuid
      `)
    }

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE cliente_contactos SET
        nombre   = COALESCE(${nombre   ?? null}, nombre),
        cargo    = COALESCE(${cargo    ?? null}, cargo),
        telefono = COALESCE(${telefono ?? null}, telefono),
        email    = COALESCE(${email    ?? null}, email),
        notas    = COALESCE(${notas    ?? null}, notas),
        principal= COALESCE(${typeof principal === 'boolean' ? principal : null}, principal),
        es_pagador = COALESCE(${typeof es_pagador === 'boolean' ? es_pagador : null}, es_pagador),
        updated_at = now()
      WHERE id = ${contactoId}::uuid
      RETURNING *
    `)
    return NextResponse.json({ ok: true, contacto: rows[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — eliminar contacto
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; contactoId: string }> }
) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id, contactoId } = await params
    const res = await prisma.$executeRaw(Prisma.sql`
      DELETE FROM cliente_contactos
      WHERE id = ${contactoId}::uuid AND cliente_id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    if (!res) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
