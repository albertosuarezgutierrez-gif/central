// La fuente de la campana «Tienes el precio de tu renovación y alternativas» (04/11/2026, `2026-11-05b`).
//
// 🛡️ Parte de `portal_vinculo` de la identidad de la COOKIE (nunca de un id de la petición), sin las vistas de corredor:
// solo ve el aviso quien entra con la ficha del TOMADOR del presupuesto (la misma regla que abre la página). Un
// autorizado, o quien solo figura en la póliza, no lo recibe.
// 🚨 Sin importes ni compañías: el aviso dice que hay algo; el detalle está en la página. Sin la migración no puede haber
// ninguna renovación publicada: `[]` (leído, no hay). Cualquier otro fallo LANZA (la campana lo declara ilegible).
import type { PresupuestoParaAviso } from '@central/module-seguros-portal'

import { prisma } from './db'
import { requireIdentidad } from './session'

export async function presupuestosParaAvisoDeIdentidad(identidadId: string): Promise<PresupuestoParaAviso[]> {
  // Cinturón: la identidad que llega es la de la sesión (la ruta la saca de `requireIdentidad`).
  const sesion = await requireIdentidad()
  if (sesion.id !== identidadId) return []
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId, origen: { not: 'corredor' } },
    select: { clienteId: true, correduriaId: true },
  })
  if (vinculos.length === 0) return []
  const out: PresupuestoParaAviso[] = []
  for (const v of vinculos) {
    try {
      const filas = await prisma.$queryRaw<{ id: string; ramo: string | null }[]>`
        select p.id::text as id, p.ramo from seguros.presupuesto p
        where p.correduria_id = ${v.correduriaId}::uuid and p.cliente_id = ${v.clienteId}::uuid
          and p.modo = 'renovacion' and p.enviado_at is not null and p.retirado_at is null
          and p.aceptado_at is null and p.emitido_at is null and p.eleccion_cliente is null and p.vence_el > now()
        order by p.enviado_at desc limit 5`
      out.push(...filas)
    } catch (e) {
      if (/42703|does not exist|no existe/i.test(e instanceof Error ? e.message : String(e))) return []
      throw e
    }
  }
  return out
}
