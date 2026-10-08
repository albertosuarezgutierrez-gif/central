import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'
import { rutaPortalEmpleado } from '@/lib/empleados-columnas'

// POST — devuelve el enlace de acceso VIGENTE de UN empleado (no lo rota), a petición expresa del
// responsable (botón «Ver enlace»). Sustituye a exponer el token en listados/props: es el ÚNICO
// sitio del panel que lee esa columna (lo vigila lib/acceso-token-guardian.test.ts). Scope por empresa.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const rows = await prisma.$queryRaw<{ acceso_token: string | null }[]>(Prisma.sql`
      SELECT acceso_token FROM rrhh.empleados
      WHERE id=${id}::uuid AND empresa_id=${empresa_id}::uuid LIMIT 1`)
    if (!rows[0]) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
    if (!rows[0].acceso_token) return NextResponse.json({ error: 'El empleado no tiene enlace de acceso' }, { status: 404 })
    return NextResponse.json({ enlace: rutaPortalEmpleado(rows[0].acceso_token) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
