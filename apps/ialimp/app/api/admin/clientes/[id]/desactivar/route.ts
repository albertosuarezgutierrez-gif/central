import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireSession } from '@/lib/tenant'
import { genHex } from '@central/core-identity'

export const dynamic = 'force-dynamic'

// Facturas que aún "deben dinero" (pendientes de cobro) = ni pagadas ni anuladas/borrador.
const ESTADOS_PENDIENTES = ['emitida', 'vencida']

// GET — preview de impacto para el modal de confirmación (no modifica nada)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await requireSession()
    if (!empresa_id) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { id } = await params

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM propiedades p
           WHERE p.cliente_id = c.id) AS num_propiedades,
        (SELECT COUNT(*)::int FROM cleaning_sessions cs
           WHERE cs.cliente_id = c.id
             AND cs.session_date >= CURRENT_DATE
             AND cs.completed_at IS NULL) AS sesiones_futuras,
        (SELECT COUNT(*)::int FROM facturas_clientes f
           WHERE f.cliente_id = c.id AND f.empresa_id = c.empresa_id) AS facturas_total,
        (SELECT COUNT(*)::int FROM facturas_clientes f
           WHERE f.cliente_id = c.id AND f.empresa_id = c.empresa_id
             AND f.estado IN (${Prisma.join(ESTADOS_PENDIENTES)})) AS facturas_pendientes,
        (SELECT COALESCE(SUM(f.total), 0) FROM facturas_clientes f
           WHERE f.cliente_id = c.id AND f.empresa_id = c.empresa_id
             AND f.estado IN (${Prisma.join(ESTADOS_PENDIENTES)})) AS importe_pendiente
      FROM clientes c
      WHERE c.id = ${id}::uuid AND c.empresa_id = ${empresa_id}::uuid
    `)
    if (!rows.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — desactiva el cliente (baja reversible, conserva todo el histórico)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const empresa_id = session.empresa_id
    if (!empresa_id) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { id } = await params
    const { motivo } = await req.json().catch(() => ({}))

    const result = await prisma.$transaction(async (tx) => {
      // 1. Marca el cliente como inactivo (+ auditoría) y corta el acceso al portal
      //    rotando session_jti a un valor nuevo (NUNCA NULL: la regla de gracia lo
      //    re-permitiría). El login del portal ya rechaza clientes inactivos.
      const upd = await tx.$queryRaw<any[]>(Prisma.sql`
        UPDATE clientes SET
          activo             = false,
          desactivado_at     = now(),
          desactivado_por    = ${session.usuario_id ?? null}::uuid,
          desactivado_motivo = ${motivo?.trim() || null},
          session_jti        = ${genHex(16)},
          updated_at         = now()
        WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid AND activo = true
        RETURNING id
      `)
      if (!upd.length) return null

      // 2. Cancela las limpiezas futuras aún no hechas (las completadas se conservan).
      const del = await tx.$executeRaw(Prisma.sql`
        DELETE FROM cleaning_sessions
        WHERE cliente_id = ${id}::uuid
          AND session_date >= CURRENT_DATE
          AND completed_at IS NULL
      `)
      return { sesiones_canceladas: del }
    })

    if (!result) return NextResponse.json({ error: 'No encontrado o ya estaba inactivo' }, { status: 404 })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
