// Lectura de «Compras previstas» (solo servidor). Siempre filtrada por cuenta_id.
// `null` = no se pudo leer (p. ej. la tabla aún no está creada) ≠ `[]` = no hay ninguna.
import { prisma } from './db'
import type { CompraGuardada } from './fiscal-panel.ts'
import type { TipoCompra } from './simulador-irpf.ts'

export async function listarComprasPrevistas(cuentaId: string): Promise<CompraGuardada[] | null> {
  try {
    const rows = await prisma.fiscalCompraPrevista.findMany({ where: { cuentaId }, orderBy: { createdAt: 'asc' }, take: 100 })
    return rows.map(r => ({
      id: r.id, descripcion: r.descripcion, importe: Number(r.importe), propertyId: r.propertyId,
      tipo: (r.tipo as TipoCompra | null) ?? null, fechaPrevista: r.fechaPrevista ? r.fechaPrevista.toISOString().slice(0, 10) : null,
    }))
  } catch (e) {
    console.error('[fiscal-compras] lectura caída:', e instanceof Error ? e.message : e)
    return null
  }
}

/** ¿El piso existe en la titularidad fiscal? (la tabla no tiene FK a `properties`: el id lo valida la app). */
export async function pisoExiste(propertyId: string): Promise<boolean> {
  try {
    const r = await prisma.$queryRaw<Array<{ n: number }>>`SELECT 1 AS n FROM propiedad_titularidad WHERE propiedad_id = ${propertyId} LIMIT 1`
    return r.length > 0
  } catch (e) {
    console.error('[fiscal-compras] pisoExiste:', e instanceof Error ? e.message : e)
    return false
  }
}
