// Editar / borrar un prospecto (panel superadmin).
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { isSuperadmin } from '@/lib/tenant'

// PATCH: editar estado/notas/teléfono, fijar recordatorio o dar de baja a mano.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const { id } = await params
    const b = await req.json()

    if (typeof b.estado === 'string')
      await prisma.$executeRaw(Prisma.sql`UPDATE mailing_prospectos SET estado = ${b.estado} WHERE id = ${id}::uuid`)
    if (typeof b.notas === 'string')
      await prisma.$executeRaw(Prisma.sql`UPDATE mailing_prospectos SET notas = ${b.notas} WHERE id = ${id}::uuid`)
    if (typeof b.telefono === 'string')
      await prisma.$executeRaw(Prisma.sql`UPDATE mailing_prospectos SET telefono = ${b.telefono} WHERE id = ${id}::uuid`)
    if (typeof b.email === 'string') {
      const email = b.email.trim().toLowerCase()
      if (email)
        // Solo si ese email no lo tiene ya otro prospecto (índice único lower(email)).
        await prisma.$executeRaw(Prisma.sql`UPDATE mailing_prospectos SET email = ${email}, email_buscado_at = now() WHERE id = ${id}::uuid AND NOT EXISTS (SELECT 1 FROM mailing_prospectos WHERE lower(email) = ${email} AND id <> ${id}::uuid)`)
      else
        await prisma.$executeRaw(Prisma.sql`UPDATE mailing_prospectos SET email = NULL WHERE id = ${id}::uuid`)
    }
    if (typeof b.web === 'string')
      await prisma.$executeRaw(Prisma.sql`UPDATE mailing_prospectos SET web = ${b.web.trim() || null} WHERE id = ${id}::uuid`)
    if ('seguimiento_proximo_at' in b)
      await prisma.$executeRaw(Prisma.sql`UPDATE mailing_prospectos SET seguimiento_proximo_at = ${b.seguimiento_proximo_at ? new Date(b.seguimiento_proximo_at) : null} WHERE id = ${id}::uuid`)
    if (b.baja === true)
      await prisma.$executeRaw(Prisma.sql`UPDATE mailing_prospectos SET baja = true, baja_at = COALESCE(baja_at, now()), baja_motivo = 'manual', estado = 'descartado' WHERE id = ${id}::uuid`)
    if (b.baja === false)
      await prisma.$executeRaw(Prisma.sql`UPDATE mailing_prospectos SET baja = false, baja_at = NULL, baja_motivo = NULL WHERE id = ${id}::uuid`)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const { id } = await params
    await prisma.$executeRaw(Prisma.sql`DELETE FROM mailing_prospectos WHERE id = ${id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
