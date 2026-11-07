import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'
import { validarAltaRapida } from '@/lib/alta-empleado'
import { darDeAltaLote } from '@/lib/alta-empleado-repo'
import { codigoError } from '@/lib/codigo-error'
import { saldoVacacionesEmpleados } from '@/lib/solicitudes'
import { SQL_COLUMNAS_LISTADO_EMPLEADOS } from '@/lib/empleados-columnas'

export async function GET(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const anio = parseInt(new URL(req.url).searchParams.get('anio') ?? '') || new Date().getFullYear()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${Prisma.raw(SQL_COLUMNAS_LISTADO_EMPLEADOS)}
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
    // Misma escritura que el asistente y la importación (lib/alta-empleado-repo.ts): duplicados mirados bajo cerrojo.
    const v = validarAltaRapida(body ?? {})
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const r = await darDeAltaLote(empresa_id, [v.alta])
    if (!r.creados.length) return NextResponse.json({ error: r.rechazadas[0]?.motivo ?? 'No se pudo crear' }, { status: 409 })
    return NextResponse.json({ empleado: { id: r.creados[0].id, nombre: v.alta.nombre, apellidos: v.alta.apellidos } }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    // 🚨 No se relanza: el error de Prisma lleva valores de la fila (DNI, NAF, IBAN) y Next lo volcaría al log.
    console.error('[empleados] alta fallida', codigoError(e))
    return NextResponse.json({ error: 'No se ha podido dar de alta al empleado. Vuelve a intentarlo.' }, { status: 500 })
  }
}
