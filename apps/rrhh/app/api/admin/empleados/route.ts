import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'
import { generarAccesoToken, normalizarEmpleado } from '@/lib/empleados'
import { nuevaPersonaId } from '@central/core-identity'
import { saldoVacacionesEmpleados } from '@/lib/solicitudes'

export async function GET(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const anio = parseInt(new URL(req.url).searchParams.get('anio') ?? '') || new Date().getFullYear()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, apellidos, dni, nss, email, telefono, puesto, estado, acceso_token, creada_at
      FROM rrhh.empleados WHERE empresa_id = ${empresa_id}::uuid
      ORDER BY COALESCE(apellidos, nombre) ASC, nombre ASC`)
    const { map: saldos, devengados } = await saldoVacacionesEmpleados(empresa_id, anio)
    const empleados = rows.map((e: any) => ({
      ...e,
      vacaciones: saldos.get(e.id?.toString()) ?? { aprobados: 0, en_tramite: 0, pendientes: devengados },
    }))
    return NextResponse.json({ empleados })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const body = await req.json().catch(() => ({}))
    const n = normalizarEmpleado(body)
    const token = generarAccesoToken()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO rrhh.empleados (empresa_id, nombre, apellidos, dni, email, telefono, puesto, acceso_token, persona_id)
      VALUES (${empresa_id}::uuid, ${n.nombre}, ${n.apellidos}, ${n.dni}, ${n.email}, ${n.telefono}, ${body.puesto ?? null}, ${token}, ${nuevaPersonaId()}::uuid)
      RETURNING id, nombre, apellidos, acceso_token`)
    return NextResponse.json({ empleado: rows[0] }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('obligatorio')) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
