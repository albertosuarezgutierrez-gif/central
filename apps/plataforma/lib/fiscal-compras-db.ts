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
