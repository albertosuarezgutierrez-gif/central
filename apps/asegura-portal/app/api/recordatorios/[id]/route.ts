import { NextResponse } from 'next/server'

import { borrarRecordatorio } from '@/lib/recordatorios'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * Borra un recordatorio PROPIO. El aislamiento lo da este código, no RLS
 * (`prisma_asegura_portal` no tiene políticas que resuelvan `auth.uid()`):
 * `borrarRecordatorio()` filtra por `identidadId` ADEMÁS de por `id`, y
 * también exige que sea uno de los suyos y no una obligación derivada de
 * póliza. `false` cubre a la vez «no existe», «no es tuyo» y «no es de este
 * botón» — no se distinguen a propósito, igual que en `polizas/[id]`.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const { id } = await ctx.params
  const borrado = await borrarRecordatorio(identidad.id, id)
  if (!borrado) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
