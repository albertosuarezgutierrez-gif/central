import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'
import { generarAccesoToken, normalizarEmpleado } from '@/lib/empleados'
import { nuevaPersonaId } from '@central/core-identity'

export async function GET() {
  try {
    const { empresa_id } = await getSesion()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, dni, email, telefono, puesto, estado, acceso_token, creada_at
      FROM empleados WHERE empresa_id = ${empresa_id}::uuid ORDER BY nombre ASC`)
    return NextResponse.json({ empleados: rows })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const body = await req.json().catch(() => ({}))
    const n = normalizarEmpleado(body)
    const token = generarAccesoToken()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO empleados (empresa_id, nombre, dni, email, telefono, puesto, acceso_token, persona_id)
      VALUES (${empresa_id}::uuid, ${n.nombre}, ${n.dni}, ${n.email}, ${n.telefono}, ${body.puesto ?? null}, ${token}, ${nuevaPersonaId()}::uuid)
      RETURNING id, nombre, acceso_token`)
    return NextResponse.json({ empleado: rows[0] }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('obligatorio')) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
