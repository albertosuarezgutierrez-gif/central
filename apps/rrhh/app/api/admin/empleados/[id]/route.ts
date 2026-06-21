import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    // PATCH PARCIAL: solo se tocan los campos enviados (COALESCE), para no machacar a NULL
    // dni/telefono cuando la edición no los incluye. El nombre, si viene, no puede quedar vacío.
    const nombre = body.nombre !== undefined ? String(body.nombre).trim() : null
    if (body.nombre !== undefined && !nombre) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    const email    = body.email    !== undefined ? (String(body.email).trim()    || null) : undefined
    const telefono = body.telefono !== undefined ? (String(body.telefono).trim() || null) : undefined
    const dni      = body.dni      !== undefined ? (String(body.dni).trim()      || null) : undefined
    const puesto   = body.puesto   !== undefined ? (String(body.puesto).trim()   || null) : undefined
    const estado   = body.estado   !== undefined ? String(body.estado)                    : undefined
    await prisma.$executeRaw(Prisma.sql`
      UPDATE empleados SET
        nombre   = COALESCE(${nombre},   nombre),
        email    = ${email    === undefined ? Prisma.sql`email`    : Prisma.sql`${email}`},
        telefono = ${telefono === undefined ? Prisma.sql`telefono` : Prisma.sql`${telefono}`},
        dni      = ${dni      === undefined ? Prisma.sql`dni`      : Prisma.sql`${dni}`},
        puesto   = ${puesto   === undefined ? Prisma.sql`puesto`   : Prisma.sql`${puesto}`},
        estado   = COALESCE(${estado},   estado)
      WHERE id=${id}::uuid AND empresa_id=${empresa_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('obligatorio')) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    // Blindaje: si el empleado tiene documentos FIRMADOS, no se borra en duro (hay que conservar
    // la evidencia legal). Se obliga a darlo de baja (PATCH estado='baja') en su lugar.
    const firmas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT 1 FROM rrhh.firmas WHERE empleado_id=${id}::uuid AND empresa_id=${empresa_id}::uuid LIMIT 1`)
    if (firmas[0]) {
      return NextResponse.json(
        { error: 'Este empleado tiene documentos firmados: no puede borrarse (se conserva por evidencia legal). Dale de baja en su lugar.' },
        { status: 409 })
    }
    await prisma.$executeRaw(Prisma.sql`DELETE FROM rrhh.documentos WHERE empleado_id=${id}::uuid AND empresa_id=${empresa_id}::uuid`)
    await prisma.$executeRaw(Prisma.sql`DELETE FROM empleados WHERE id=${id}::uuid AND empresa_id=${empresa_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
