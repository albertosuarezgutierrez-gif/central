// PATRIMONIO (24/10/2026, P13) — lectura con BD del CALENDARIO: obligaciones de inmueble + contratos de los titulares que
// ve esta sesión. La regla es `calendario.ts` (pura).
//
// 🚨 TODA función parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`): los inmuebles se buscan DENTRO de
// los titulares autorizados (y vivos), y las obligaciones/contratos cuelgan SOLO de esos ids. Nada llega de la request.
// Una lectura que falla LANZA: quien llama la convierte en «sin comprobar» (`null`), nunca en «no tienes nada».
import { fechaMadrid } from './dia-madrid'
import { accesosPatrimonio } from './accesos'
import { calendarioDeEntrada, resumenDeCalendario, type ResumenCalendario, type VencimientoVista } from './calendario'
import { prisma } from '../db'
import { getIdentidad } from '../session'
import { contratoDeFila, obligacionDeFila, type FilaContrato } from './lectura'

export type CalendarioDeIdentidad = { hoy: string; vencimientos: VencimientoVista[]; resumen: ResumenCalendario }

/** `null` = esta identidad no tiene patrimonio a la vista. Lanza si la BD falla. */
export async function calendarioDeIdentidad(identidadId: string): Promise<CalendarioDeIdentidad | null> {
  if ((await getIdentidad())?.id !== identidadId) return null
  const acc = await accesosPatrimonio(identidadId)
  if (acc.size === 0) return null
  return calendarioDeClientes([...acc.keys()])
}

/**
 * ⚠️ SOLO para dos llamadores: `calendarioDeIdentidad` (arriba, tras `accesosPatrimonio`) y el cron de push
 * (`avisos-push-bd.ts`, que no tiene cookie y pasa únicamente las fichas PROPIAS de la identidad que operan). Quien
 * llame con una lista de fichas que no haya acotado a una identidad está leyendo el patrimonio de cualquiera.
 * Cepo: `test/regression-portal-patrimonio-aislamiento.test.ts`.
 */
export async function calendarioDeClientes(clientesIds: readonly string[]): Promise<CalendarioDeIdentidad> {
  const inmuebles = await prisma.portalPatrimonioInmueble.findMany({
    where: { archivadoEn: null, titular: { clienteId: { in: [...clientesIds] }, archivadoEn: null } },
    select: { id: true, alias: true },
    orderBy: { alias: 'asc' },
    take: 500,
  })
  const ids = inmuebles.map((i) => i.id)
  if (ids.length === 0) return { hoy: fechaMadrid(new Date()), vencimientos: [], resumen: { vencidas: 0, porVencer: 0, sinFecha: 0 } }

  const [obligaciones, contratos] = await Promise.all([
    prisma.portalPatrimonioObligacion.findMany({
      where: { inmuebleId: { in: ids }, archivadoEn: null },
      select: { id: true, inmuebleId: true, tipo: true, aplica: true, ultima: true, vence: true, periodicidadMeses: true },
      take: 2000,
    }),
    prisma.portalPatrimonioContrato.findMany({
      where: { inmuebleId: { in: ids }, archivadoEn: null },
      include: { actualizaciones: { orderBy: { desde: 'asc' } } },
      take: 1000,
    }),
  ])
  const hoy = fechaMadrid(new Date())
  const vencimientos = calendarioDeEntrada(
    {
      inmuebles,
      obligaciones: obligaciones.map((o) => obligacionDeFila(o)),
      // Los inquilinos no hacen falta para el calendario (y su PII no pasa por aquí).
      contratos: contratos.map((c) => contratoDeFila(c as FilaContrato, [], c.actualizaciones)),
    },
    hoy,
  )
  return { hoy, vencimientos, resumen: resumenDeCalendario(vencimientos) }
}
