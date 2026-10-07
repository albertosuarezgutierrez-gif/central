import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'

// POST — «Cerrar sesiones»: sube `sesion_version` y toda cookie del portal /e de ese empleado deja
// de valer en su próxima petición (móvil perdido, despido, cookie compartida). Scope por empresa.
// No toca el enlace ni el PIN: para eso está «Nuevo enlace».
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.empleados SET sesion_version = sesion_version + 1
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`)
    if (n !== 1) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
