// apps/plataforma/lib/contable/acciones.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { aprenderReglaMovimiento, getMovParaCallback } from '@/lib/agente-movimientos'

export type AccionPropuesta = { id: string; tipo: string; resumen: string }

// Persiste cada acción propuesta (estado 'pendiente') y devuelve sus ids para la UI.
export async function guardarAcciones(
  cuentaId: string, props: { tipo: string; params: Record<string, any>; resumen: string }[],
): Promise<AccionPropuesta[]> {
  const out: AccionPropuesta[] = []
  for (const p of props) {
    const rows = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      INSERT INTO contable_accion (cuenta_id, tipo, params, resumen)
      VALUES (${cuentaId}::uuid, ${p.tipo}, ${JSON.stringify(p.params)}::jsonb, ${p.resumen})
      RETURNING id`).catch(() => [])
    if (rows[0]) out.push({ id: String(rows[0].id), tipo: p.tipo, resumen: p.resumen })
  }
  return out
}

async function marcar(accionId: string, estado: string, resultado: string | null): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE contable_accion SET estado = ${estado}, resultado = ${resultado}
    WHERE id = ${accionId}::bigint`).catch(() => {})
}

export async function descartarAccion(cuentaId: string, accionId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE contable_accion SET estado = 'descartada'
    WHERE id = ${accionId}::bigint AND cuenta_id = ${cuentaId}::uuid AND estado = 'pendiente'`).catch(() => {})
}

// Ejecuta una acción PENDIENTE por id (nunca confía en params del cliente: los lee de la BD).
export async function ejecutarAccion(cuentaId: string, accionId: string): Promise<{ ok: boolean; mensaje: string }> {
  const rows = await prisma.$queryRaw<{ tipo: string; params: any; estado: string }[]>(Prisma.sql`
    SELECT tipo, params, estado FROM contable_accion
    WHERE id = ${accionId}::bigint AND cuenta_id = ${cuentaId}::uuid LIMIT 1`).catch(() => [])
  const acc = rows[0]
  if (!acc) return { ok: false, mensaje: 'Acción no encontrada' }
  if (acc.estado !== 'pendiente') return { ok: false, mensaje: `La acción ya está ${acc.estado}` }

  const p = acc.params || {}
  const movId = String(p.movId || '')
  const mov = movId ? await getMovParaCallback(movId) : null
  if (!mov || mov.cuentaId !== cuentaId) { await marcar(accionId, 'error', 'Movimiento no válido'); return { ok: false, mensaje: 'Movimiento no válido' } }

  const scope = Prisma.sql`AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${cuentaId}::uuid)`
  try {
    if (acc.tipo === 'clasificar') {
      const destino = String(p.destino || '')
      const propiedad = p.propiedad ? String(p.propiedad) : null
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios
        SET destino = ${destino}, destino_confirmado = true, requiere_revision = false, propiedad_id = ${propiedad}
        WHERE id = ${movId}::uuid ${scope}`)
      if (mov.concepto) await aprenderReglaMovimiento(cuentaId, mov.concepto, destino)
    } else if (acc.tipo === 'amortizable') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios SET amortizable = ${p.valor !== false}
        WHERE id = ${movId}::uuid ${scope}`)
    } else if (acc.tipo === 'confirmar') {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios SET destino_confirmado = true, requiere_revision = false
        WHERE id = ${movId}::uuid ${scope}`)
    } else if (acc.tipo === 'conciliar') {
      const ref = (p.facturaRef ? String(p.facturaRef) : 'doc').slice(0, 120)
      await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios SET conciliado = true, factura_ref = ${ref}
        WHERE id = ${movId}::uuid ${scope}`)
    } else {
      await marcar(accionId, 'error', 'Tipo no soportado')
      return { ok: false, mensaje: 'Tipo no soportado' }
    }
  } catch (e: any) {
    await marcar(accionId, 'error', String(e?.message || e).slice(0, 140))
    return { ok: false, mensaje: 'No se pudo ejecutar la acción' }
  }
  await marcar(accionId, 'ejecutada', null)
  return { ok: true, mensaje: 'Hecho ✓' }
}
