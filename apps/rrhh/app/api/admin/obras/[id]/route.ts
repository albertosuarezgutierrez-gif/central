import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const { nombre, direccion, lat, lng, radio_m, activa } = await req.json().catch(() => ({}))
    await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.obras SET
        nombre = COALESCE(${nombre ?? null}, nombre),
        direccion = COALESCE(${direccion ?? null}, direccion),
        lat = COALESCE(${lat ?? null}, lat),
        lng = COALESCE(${lng ?? null}, lng),
        radio_m = COALESCE(${radio_m ?? null}, radio_m),
        activa = COALESCE(${activa ?? null}, activa)
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    await prisma.$executeRaw(Prisma.sql`DELETE FROM rrhh.obras WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
