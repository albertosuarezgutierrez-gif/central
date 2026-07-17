import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { pushEmpleado } from '@/lib/push'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await getSesion()
    const { empresa_id, usuario_id } = sesion
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const salida_at = body.salida_at ?? null
    const observaciones = body.observaciones ?? null
    const motivo: string | null = body.motivo ?? null

    if (!motivo?.trim()) {
      return NextResponse.json({ error: 'El motivo de la corrección es obligatorio' }, { status: 422 })
    }

    // Leer valores actuales antes de editar
    const antes = await prisma.$queryRaw<{ empleado_id: string; salida_at: string | null; observaciones: string | null; estado: string }[]>(
      Prisma.sql`SELECT empleado_id, salida_at, observaciones, estado FROM rrhh.fichajes WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`
    )
    if (!antes.length) return NextResponse.json({ error: 'Fichaje no encontrado' }, { status: 404 })
    const prev = antes[0]

    await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.fichajes SET
        salida_at = COALESCE(${salida_at}::timestamptz, salida_at),
        observaciones = COALESCE(${observaciones}, observaciones),
        estado = CASE WHEN ${salida_at} IS NOT NULL THEN 'cerrado' ELSE estado END,
        horas_totales = CASE WHEN ${salida_at} IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (${salida_at}::timestamptz - entrada_at)) / 3600.0, 2)
          ELSE horas_totales END
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`)

    // Registrar auditoría por cada campo modificado
    const cambios: { campo: string; antes: string | null; despues: string | null }[] = []
    if (salida_at && (!prev.salida_at || new Date(salida_at).getTime() !== new Date(prev.salida_at).getTime())) {
      cambios.push({ campo: 'salida_at', antes: prev.salida_at, despues: salida_at })
    }
    if (observaciones && observaciones !== prev.observaciones) {
      cambios.push({ campo: 'observaciones', antes: prev.observaciones, despues: observaciones })
    }

    for (const c of cambios) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO rrhh.fichajes_audit (fichaje_id, empresa_id, usuario_id, campo, valor_antes, valor_despues, motivo)
        VALUES (${id}::uuid, ${empresa_id}::uuid, ${usuario_id ?? null}::uuid, ${c.campo}, ${c.antes}, ${c.despues}, ${motivo})
      `)
    }

    // Notificar al empleado si hubo cambios
    if (cambios.length > 0) {
      try {
        await pushEmpleado(empresa_id, prev.empleado_id, '📋 Fichaje corregido', `Un responsable ha modificado tu fichaje. Motivo: ${motivo}`, '/e')
      } catch { /* push no crítico */ }
    }

    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const auditoria = await prisma.$queryRaw<{ campo: string; valor_antes: string | null; valor_despues: string | null; motivo: string; creado_at: string }[]>(
      Prisma.sql`
        SELECT campo, valor_antes, valor_despues, motivo, creado_at
        FROM rrhh.fichajes_audit
        WHERE fichaje_id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
        ORDER BY creado_at DESC
      `
    )
    return NextResponse.json({ auditoria })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
