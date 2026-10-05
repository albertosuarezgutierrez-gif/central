import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'
import { generarAccesoToken } from '@/lib/empleados'
import { rutaPortalEmpleado } from '@/lib/empleados-columnas'

// POST — regenera el enlace mágico de acceso del empleado (revoca el anterior). Scope por empresa.
// Devuelve SOLO la ruta del portal (`enlace`), nunca la columna en bruto.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const token = generarAccesoToken()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE rrhh.empleados SET acceso_token=${token}
      WHERE id=${id}::uuid AND empresa_id=${empresa_id}::uuid
      RETURNING id`)
    if (!rows[0]) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
    return NextResponse.json({ enlace: rutaPortalEmpleado(token) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
