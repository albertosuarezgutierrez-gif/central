import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { accesoLimpieza } from '@/lib/limpieza-acceso'

export const dynamic = 'force-dynamic'

// PATCH — la limpieza (o Alberto en preview) marca una tarea como hecha/deshecha.
// Solo el flag `hecha`: crear/editar/borrar tareas es del panel de Alberto
// (/api/sivra/limpiadoras/tareas, sesión).
export async function PATCH(req: NextRequest) {
  const modo = await accesoLimpieza()
  if (!modo) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, hecha } = await req.json().catch(() => ({}))
  if (typeof id !== 'string' || typeof hecha !== 'boolean') {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE limpieza_tareas
    SET hecha = ${hecha}, hecha_at = ${hecha ? new Date() : null}::timestamptz
    WHERE id = ${id}::uuid
  `)
  return NextResponse.json({ ok: true })
}
