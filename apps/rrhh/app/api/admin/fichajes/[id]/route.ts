import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const salida_at = body.salida_at ?? null
    const observaciones = body.observaciones ?? null
    await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.fichajes SET
        salida_at = COALESCE(${salida_at}::timestamptz, salida_at),
        observaciones = COALESCE(${observaciones}, observaciones),
        estado = CASE WHEN ${salida_at} IS NOT NULL THEN 'cerrado' ELSE estado END,
        horas_totales = CASE WHEN ${salida_at} IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (${salida_at}::timestamptz - entrada_at)) / 3600.0, 2)
          ELSE horas_totales END
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
