// PATRIMONIO (27/10/2026) — adaptador con BD de `gastos-resolver-api.ts`.
// 🚨 Como `facturas-bd.ts`: parte de `accesosPatrimonio(identidadId)`; `titular_id` se resuelve aquí desde la ficha ya
// autorizada y toda lectura/escritura lleva `titularId` + `origen in (plantilla, derrama)` en el `where` (id ajeno = 404).
// Solo toca columnas con UPDATE para `prisma_asegura_portal` (estado, confirmado_en, confirmado_por_identidad_id,
// total_cent): comprobado en `information_schema.column_privileges` el 27/10/2026. Sin SQL nuevo.
import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import type { AccesosMapa } from './gastos-api'
import { titularDe } from './gastos-bd'
import type { PuertosResolverGasto } from './gastos-resolver-api'

export function puertosResolverGasto(identidadId: string, ahora: () => Date = () => new Date()): PuertosResolverGasto {
  let cache: AccesosMapa | null = null
  return {
    accesos: async () => (cache ??= await accesosPatrimonio(identidadId)),
    async resolver({ clienteId, gastoId, accion, importeCent }) {
      if ((await getIdentidad())?.id !== identidadId) return 'no_encontrado'
      const t = await titularDe(clienteId, identidadId)
      if (!t) return 'no_encontrado'
      const donde = { id: gastoId, titularId: t.id, origen: { in: ['plantilla', 'derrama'] } }
      const g = await prisma.portalPatrimonioGasto.findFirst({ where: donde, select: { estado: true, totalCent: true, baseCent: true } })
      if (!g) return 'no_encontrado'
      if (g.estado !== 'propuesto') return 'ya_resuelto'
      if (accion === 'descartar') {
        const r = await prisma.portalPatrimonioGasto.updateMany({ where: { ...donde, estado: 'propuesto' }, data: { estado: 'descartado' } })
        return r.count === 1 ? 'ok' : 'ya_resuelto'
      }
      // CHECK de BD: confirmado exige algún importe. Importe variable sin importe dado = se pide, no se inventa un 0.
      if (g.totalCent === null && g.baseCent === null && importeCent === null) return 'importe_requerido'
      const r = await prisma.portalPatrimonioGasto.updateMany({
        where: { ...donde, estado: 'propuesto' },
        data: {
          estado: 'confirmado',
          confirmadoEn: ahora(),
          confirmadoPorIdentidadId: identidadId,
          ...(importeCent !== null ? { totalCent: BigInt(importeCent) } : {}),
        },
      })
      return r.count === 1 ? 'ok' : 'ya_resuelto'
    },
  }
}
