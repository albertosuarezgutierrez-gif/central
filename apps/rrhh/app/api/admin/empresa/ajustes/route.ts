import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSesion, AuthError } from '@/lib/tenant'
import { validarPermiteFicharSinUbicacion } from '@/lib/ajustes-empresa'

// Ajustes de la empresa de la SESIÓN (nunca un id del body). Hoy: fichar sin ubicación.
export async function GET() {
  try {
    const { empresa_id } = await getSesion()
    const rows = await prisma.$queryRaw<{ permite: boolean }[]>(Prisma.sql`
      SELECT permite_fichar_sin_ubicacion AS permite FROM rrhh.empresas WHERE id = ${empresa_id}::uuid LIMIT 1`)
    if (rows.length === 0) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    return NextResponse.json({ permite_fichar_sin_ubicacion: rows[0].permite === true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    console.error('[ajustes-empresa] GET fallo:', e)
    return NextResponse.json({ error: 'No se pudieron leer los ajustes' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const body = await req.json().catch(() => null)
    const v = validarPermiteFicharSinUbicacion(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.empresas SET permite_fichar_sin_ubicacion = ${v.valor} WHERE id = ${empresa_id}::uuid`)
    if (n === 0) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true, permite_fichar_sin_ubicacion: v.valor })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    console.error('[ajustes-empresa] PATCH fallo:', e)
    return NextResponse.json({ error: 'No se pudo guardar el ajuste' }, { status: 500 })
  }
}
