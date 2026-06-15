import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'
import { normalizarEmpleado } from '@/lib/empleados'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const n = normalizarEmpleado(body)
    await prisma.$executeRaw(Prisma.sql`
      UPDATE empleados SET nombre=${n.nombre}, dni=${n.dni}, email=${n.email}, telefono=${n.telefono},
        puesto=${body.puesto ?? null}, estado=${body.estado ?? 'activo'}
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
    await prisma.$executeRaw(Prisma.sql`DELETE FROM empleados WHERE id=${id}::uuid AND empresa_id=${empresa_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
