import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET() {
  try {
    const { empresa_id } = await getSesion()
    const obras = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, direccion, lat, lng, radio_m, activa, creada_at
      FROM rrhh.obras WHERE empresa_id = ${empresa_id}::uuid ORDER BY nombre ASC`)
    return NextResponse.json({ obras: JSON.parse(JSON.stringify(obras)) })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const { nombre, direccion, lat, lng, radio_m } = await req.json().catch(() => ({}))
    if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre obligatorio' }, { status: 400 })
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO rrhh.obras (empresa_id, nombre, direccion, lat, lng, radio_m)
      VALUES (${empresa_id}::uuid, ${String(nombre).trim()}, ${direccion ?? null}, ${lat ?? null}::numeric, ${lng ?? null}::numeric, ${radio_m ?? 200})
      RETURNING *`)
    return NextResponse.json({ obra: JSON.parse(JSON.stringify(rows[0])) }, { status: 201 })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
